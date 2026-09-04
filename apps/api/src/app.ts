import { type Context, Hono } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import {
  DEFAULT_RESEARCH_ENRICHMENT,
  DensityIdSchema,
  type Enrichment,
  ENRICHMENT_AGENTS,
  type EnrichmentAgentStatus,
  enrichmentJsonSchema,
  EnrichmentSchema,
  ExtractionRulesSchema,
  GenerateKindSchema,
  PaletteChoiceSchema,
  ShapeIdSchema,
  TextScaleIdSchema,
  TypographyChoiceSchema,
} from '@research-portal/core'
import type {
  Citation,
  FacetCounts,
  MigrationEvent,
  RouteDecision,
  ScoredResource,
  TenantConfig,
} from '@research-portal/core'
import {
  AragApiError,
  type AragProvider,
  KbClient,
  KnowledgeBoxNotConnectedError,
  parseKbUrl,
  type RetrievalProvider,
} from '@research-portal/retrieval'
import { type NewTenantInput, TenantStore, type TenantStoreApi } from './tenants.ts'
import { BindingStore, type BindingStoreApi } from './bindings.ts'
import { accountOpsAvailable, createKnowledgeBox, enableHiddenResources } from './arag-account.ts'
import { GENERATE_SCHEMAS } from './generate-schemas.ts'
import {
  ASSESSMENT_INSTRUCTIONS,
  attributeBriefing,
  attributeQuiz,
  BRIEFING_INSTRUCTIONS,
} from './generate-sources.ts'
import { analyseTenant } from './analyse.ts'
import {
  type GraphStrategyInput,
  implementKgStrategy,
  KgProposalStore,
  type KgProposalStoreApi,
  proposeKgStrategy,
  replaceGraphStrategy,
  validateGraphStrategy,
} from './kg.ts'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import {
  CRAWLER_USER_AGENT,
  discoverLinks,
  extractMainContent,
  looksLikeChallengePage,
} from './crawl.ts'
import {
  classifierIntents,
  decideFromClassifier,
  defaultDecision,
  extractEntities,
  isResultsQuestion,
  parseIdentifier,
  routeByRules,
  type RouteContext,
} from './intent-router.ts'
import { matchStudies } from './study-guard.ts'
import {
  authorLine,
  lookupOf,
  metadataHit,
  resolveAuthor,
  resolveIdentifier,
} from './catalog-lookup.ts'
import {
  corpusDecline,
  documentDecline,
  forwardableSlice,
  looksLikeProviderDecline,
  rewriteSentinels,
  SentinelStream,
  stripModelReferences,
  trimTruncatedTail,
} from './answer-shape.ts'
import { applicablePrequeries } from './ask-prequeries.ts'
import { authorsNamed } from './ask-author.ts'
import {
  type AuditEvent,
  bindAndAudit,
  DOCUMENT_CHAT_ADDENDUM,
  documentContextBlocks,
  extractionText,
  publicationYearsContext,
  withoutReferencePassages,
} from './ask-grounding.ts'
import {
  compareExtraction,
  ensureLabMethods,
  labTenant,
  popplerAvailable,
  profileResource,
} from './extraction.ts'
import type { DocsHealth } from './docs-health.ts'
import {
  type EnrichmentCollisionPolicy,
  type EnrichmentRecords,
  InsightsStore,
  type InsightsStoreApi,
  InvestigationStore,
  type InvestigationStoreApi,
  McpKeyStore,
  type McpKeyStoreApi,
  questionHash,
  RoutingLog,
  SessionsStore,
  type SessionsStoreApi,
  SourceStore,
  type SourceStoreApi,
  WatchStore,
  type WatchStoreApi,
} from './stores.ts'
import { MAX_SYNC_CAP, READ_ONLY_BOX_MESSAGE, recordSyncFailure, syncSource } from './scheduler.ts'
import {
  implementSuggestion,
  runInterrogation,
  SuggestionStore,
  type SuggestionStoreApi,
} from './interrogate.ts'
import {
  clientIp,
  clientKey,
  rateLimit,
  rateLimitLayered,
  SlidingWindowLimiter,
} from './rate-limit.ts'
import {
  EnrichmentStore,
  type EnrichmentStoreApi,
  generateEnrichment,
  merchandiseCatalogPage,
  merchandiseCitation,
  merchandiseContent,
  merchandiseScored,
  merchandiseSearchResults,
  merchandiseSources,
  merchandiseSummaries,
  merchandiseSummary,
  runEnrichmentOverCorpus,
} from './enrichments.ts'
import { generateFollowUpQuestions } from './follow-up-questions.ts'
import {
  generateSuggestedQuestions,
  runSuggestedQuestionsOverCorpus,
  SUGGESTED_QUESTIONS_SCHEMA_ID,
} from './suggested-questions.ts'
import { tenantAliasLocation } from './tenant-aliases.ts'
import { registerMcpRoutes, type TrustedPortalUser } from './mcp.ts'
import {
  createCloudflareDomainProvisioner,
  type PortalDomainProvisioner,
  portalHostnameForSlug,
} from './cloudflare-domains.ts'

const searchQuerySchema = z.object({ q: z.string().min(1) })
const MAX_ENRICHMENT_IMPORT_BYTES = 8 * 1024 * 1024
const MAX_ENRICHMENT_RECORD_BYTES = 1024 * 1024
const MAX_ENRICHMENT_IMPORT_AGENTS = 100
const MAX_ENRICHMENT_IMPORT_RECORDS = 10_000
const MAX_IMPORT_ISSUES = 12

type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: 'invalid_json' | 'payload_too_large'; message: string }

async function readBoundedJson(request: Request, maxBytes: number): Promise<BoundedJsonResult> {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) {
    return {
      ok: false,
      error: 'payload_too_large',
      message: 'The enrichment import exceeds the 8 MB limit.',
    }
  }

  if (!request.body) {
    return {
      ok: false,
      error: 'invalid_json',
      message: 'The request body must be valid JSON.',
    }
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > maxBytes) {
      await reader.cancel().catch(() => undefined)
      return {
        ok: false,
        error: 'payload_too_large',
        message: 'The enrichment import exceeds the 8 MB limit.',
      }
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return {
      ok: true,
      value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    }
  } catch {
    return {
      ok: false,
      error: 'invalid_json',
      message: 'The request body must be valid JSON.',
    }
  }
}

type ImportValidationResult =
  | { success: true; data: EnrichmentRecords }
  | { success: false; issues: { path: string; message: string }[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeImportKey(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength &&
    value !== '__proto__' && value !== 'prototype' && value !== 'constructor'
}

function validateEnrichmentRecords(value: unknown): ImportValidationResult {
  if (!isRecord(value)) {
    return { success: false, issues: [{ path: '$', message: 'Expected an object by agent id.' }] }
  }

  const agents = Object.entries(value)
  if (agents.length > MAX_ENRICHMENT_IMPORT_AGENTS) {
    return {
      success: false,
      issues: [{
        path: '$',
        message: `At most ${MAX_ENRICHMENT_IMPORT_AGENTS} agents can be imported at once.`,
      }],
    }
  }

  const records: EnrichmentRecords = Object.create(null)
  const issues: { path: string; message: string }[] = []
  const textEncoder = new TextEncoder()
  let recordCount = 0

  for (const [agentId, bucketValue] of agents) {
    if (!safeImportKey(agentId, 200)) {
      issues.push({ path: '$', message: 'Agent ids must be safe, non-empty strings.' })
      if (issues.length >= MAX_IMPORT_ISSUES) break
      continue
    }
    if (!isRecord(bucketValue)) {
      issues.push({ path: agentId, message: 'Expected an object by resource id.' })
      if (issues.length >= MAX_IMPORT_ISSUES) break
      continue
    }

    const bucket: Record<string, Enrichment> = Object.create(null)
    records[agentId] = bucket
    for (const [resourceId, enrichmentValue] of Object.entries(bucketValue)) {
      recordCount++
      if (recordCount > MAX_ENRICHMENT_IMPORT_RECORDS) {
        issues.push({
          path: '$',
          message: `At most ${MAX_ENRICHMENT_IMPORT_RECORDS} records can be imported at once.`,
        })
        break
      }
      if (!safeImportKey(resourceId, 1000)) {
        issues.push({
          path: agentId,
          message: 'Resource ids must be safe, non-empty strings.',
        })
        if (issues.length >= MAX_IMPORT_ISSUES) break
        continue
      }

      const parsed = EnrichmentSchema.safeParse(enrichmentValue)
      const path = `${agentId}.${resourceId}`
      if (!parsed.success) {
        issues.push({
          path,
          message: parsed.error.issues[0]?.message ?? 'Invalid enrichment record.',
        })
      } else if (parsed.data.schemaId !== agentId) {
        issues.push({ path, message: 'schemaId must match the containing agent id.' })
      } else if (
        textEncoder.encode(JSON.stringify(parsed.data)).byteLength > MAX_ENRICHMENT_RECORD_BYTES
      ) {
        issues.push({ path, message: 'An individual enrichment cannot exceed 1 MB.' })
      } else {
        bucket[resourceId] = parsed.data
      }
      if (issues.length >= MAX_IMPORT_ISSUES) break
    }
    if (recordCount > MAX_ENRICHMENT_IMPORT_RECORDS || issues.length >= MAX_IMPORT_ISSUES) break
  }

  return issues.length > 0 ? { success: false, issues } : { success: true, data: records }
}

const routeBodySchema = z.object({
  query: z.string().min(1).max(2000),
  surface: z.enum(['ask', 'search']).optional(),
})
const extractionProfileSchema = z.object({ resourceId: z.string().min(1) })
const extractionCompareSchema = z.object({
  resourceId: z.string().min(1),
  methods: z.string().min(1).array().min(1).max(4),
  question: z.string().max(500).optional(),
  keep: z.boolean().optional(),
})
const askBodySchema = z.object({
  query: z.string().min(1),
  /** Intent id from the tenant's intents (docs/INTENT-ROUTING.md). */
  intent: z.string().min(1).max(40).optional(),
  context: z
    .object({ author: z.enum(['USER', 'AGENT']), text: z.string() })
    .array()
    .max(24)
    .optional(),
  resourceId: z.string().optional(),
  topicIds: z.string().array().max(12).optional(),
  depth: z.enum(['default', 'deep']).optional(),
  prequeries: z.string().min(3).array().max(8).optional(),
  /**
   * 'auto': the server routes the question itself (rules at once, the
   * classifier in parallel with retrieval) and reports the decision as a
   * `route` event, instead of the caller routing first and passing `intent`.
   */
  route: z.literal('auto').optional(),
})
/** The Help assistant: a question about using the portal, optional prior turns. */
const docsAskBodySchema = z.object({
  query: z.string().min(1),
  context: z
    .object({ author: z.enum(['USER', 'AGENT']), text: z.string() })
    .array()
    .max(24)
    .optional(),
})
const connectBodySchema = z.object({
  url: z.string().min(12),
  token: z.string().min(20),
})
const createKbBodySchema = z.object({ title: z.string().min(1).max(80).optional() })
const linkBodySchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  hidden: z.boolean().optional(),
})
const feedbackBodySchema = z.object({
  learningId: z.string().min(8),
  good: z.boolean(),
  text: z.string().max(2000).optional(),
})
const summarizeBodySchema = z.object({
  resourceIds: z.string().min(1).array().min(1).max(20),
  kind: z.enum(['simple', 'extended']).optional(),
})
const subqueriesBodySchema = z.object({ query: z.string().min(3).max(2000) })
const estateAskSchema = z.object({ query: z.string().min(1).max(2000) })
const sessionPutSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(200),
  updatedAt: z.string(),
  messages: z.unknown().array().max(500),
})
const watchBodySchema = z.object({ query: z.string().min(2).max(500) })
const sourceBodySchema = z.object({
  url: z.string().url(),
  auto: z.boolean().optional(),
  maxPages: z.number().int().min(1).max(MAX_SYNC_CAP).optional(),
})
const sourcePatchSchema = z.object({
  auto: z.boolean().optional(),
  maxPages: z.number().int().min(1).max(MAX_SYNC_CAP).optional(),
})
const hiddenBodySchema = z.object({ hidden: z.boolean() })
// Purge is destructive - default TRUE means "just show me the scope", never
// "go ahead and delete". An explicit { dryRun: false } is required to delete.
const purgeFailedBodySchema = z.object({ dryRun: z.boolean().optional() })
const investigationCreateSchema = z.object({
  name: z.string().min(1).max(160),
  question: z.string().max(500).optional(),
})
const investigationPatchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  question: z.string().max(500).optional(),
  notes: z.string().max(20000).optional(),
  status: z.enum(['active', 'closed']).optional(),
})
const verdictEnum = z.enum(['supports', 'partial', 'not-relevant', 'contradicts'])
const evidenceCreateSchema = z.object({
  passage: z.string().min(1).max(8000),
  resourceId: z.string().min(1).max(64),
  resourceTitle: z.string().min(1).max(300),
  score: z.number().min(0).max(1).nullable().optional(),
  question: z.string().max(500).optional(),
  verdict: verdictEnum.nullable().optional(),
  aiRelevance: z.string().max(2000).nullable().optional(),
  note: z.string().max(4000).optional(),
  tags: z.string().max(40).array().max(10).optional(),
})
const evidencePatchSchema = z.object({
  verdict: verdictEnum.nullable().optional(),
  note: z.string().max(4000).optional(),
  tags: z.string().max(40).array().max(10).optional(),
})
const artefactCreateSchema = z.object({
  kind: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  data: z.unknown(),
})
const graphStrategySchema = z.object({
  entityTypes: z.object({
    label: z.string().min(1).max(60),
    description: z.string().max(400).optional(),
  }).array().min(1).max(20),
  examples: z.object({
    text: z.string().min(10).max(2000),
    entities: z.object({
      name: z.string().min(1).max(160),
      label: z.string().min(1).max(60),
    }).array().min(1).max(20),
    relations: z.object({
      source: z.string().min(1).max(160),
      target: z.string().min(1).max(160),
      label: z.string().min(1).max(80),
    }).array().max(20),
  }).array().min(1).max(30),
  applyExisting: z.boolean(),
})
const SYNTHESIS_SCHEMA = {
  name: 'evidence_synthesis',
  description: 'A cited brief synthesised strictly from supplied evidence passages',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      supported: { type: 'array', items: { type: 'string' } },
      contested: { type: 'array', items: { type: 'string' } },
      gaps: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'supported', 'contested', 'gaps'],
  },
}

const verdictsBodySchema = z.object({
  question: z.string().min(3).max(1000),
  sources: z.object({
    id: z.string().min(1),
    title: z.string().min(1).max(300),
    passage: z.string().min(1).max(4000),
  }).array().min(1).max(12),
})

const VERDICTS_SCHEMA = {
  name: 'source_verdicts',
  description: 'Per-source relevance verdicts for a research question',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      verdicts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            verdict: {
              type: 'string',
              enum: ['supports', 'partial', 'not-relevant', 'contradicts'],
            },
            relevance: { type: 'string' },
          },
          required: ['id', 'verdict', 'relevance'],
        },
      },
    },
    required: ['verdicts'],
  },
}

const followUpsBodySchema = z.object({
  question: z.string().min(3).max(1000),
  answer: z.string().min(1).max(20000),
  passages: z.object({
    title: z.string().min(1).max(300),
    text: z.string().min(1).max(4000),
  }).array().max(12),
})

const SUBQUERIES_SCHEMA = {
  name: 'research_subquestions',
  description: 'Decompose a research question into focused sub-questions',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: { questions: { type: 'array', items: { type: 'string' } } },
    required: ['questions'],
  },
}
const textBodySchema = z.object({ title: z.string().min(1), body: z.string().min(1) })
const migrateBodySchema = z.object({ from: z.string().min(1), to: z.string().min(1) })
const generateBodySchema = z.object({
  kind: GenerateKindSchema,
  query: z.string().min(3).max(2000),
})
const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const renameTenantSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  organisation: z.string().min(1).max(120).optional(),
  tagline: z.string().min(1).max(160).optional(),
  colours: z.object({
    primary: hexColour,
    accent: hexColour,
    heroFrom: hexColour,
    heroTo: hexColour,
  }).optional(),
  typography: TypographyChoiceSchema.optional(),
  shape: ShapeIdSchema.optional(),
  textScale: TextScaleIdSchema.optional(),
  density: DensityIdSchema.optional(),
  paletteId: PaletteChoiceSchema.optional(),
  searchPlaceholder: z.string().min(3).max(120).optional(),
})
const kgImplementSchema = z.object({
  applyExisting: z.boolean(),
  includeSummaries: z.boolean().optional(),
  includeMemory: z.boolean().optional(),
})
const newTenantSchema = z.object({
  name: z.string().min(2).max(60),
  organisation: z.string().max(120).optional(),
  tagline: z.string().max(160).optional(),
})
const promptsSchema = z.object({
  ask: z.string().max(4000).optional(),
  images: z.boolean().optional(),
})
const labelsetBodySchema = z.object({
  title: z.string().min(1).max(60),
  multiple: z.boolean(),
  labels: z.string().min(1).array().max(40),
})

/** Strip quotes, whitespace and an accidental "Bearer " prefix from a pasted token. */
const cleanToken = (raw: string) =>
  raw.trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim()

/** Compare credentials without leaking the first mismatching byte through timing. */
async function secretsEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ])
  const a = new Uint8Array(leftHash)
  const b = new Uint8Array(rightHash)
  let difference = 0
  for (let index = 0; index < a.length; index += 1) difference |= a[index]! ^ b[index]!
  return difference === 0
}

/**
 * Whether a model-written "source" label on a comparison cell actually names
 * one of the sources retrieved for this query. Guards against the model
 * reaching for a plausible-looking reference on thin grounding: an invented
 * or unmatched source name is dropped (the cell keeps its assessment but
 * loses the false attribution) rather than shown as if it were real.
 */
const sourceIsKnown = (source: string, knownTitles: string[]): boolean => {
  const normalised = source.toLowerCase().trim()
  if (normalised.length < 4) return false
  return knownTitles.some((title) =>
    title.length >= 4 && (title === normalised || title.includes(normalised) ||
      normalised.includes(title))
  )
}

export type BrandingKind = 'logo' | 'hero' | 'font-heading' | 'font-body'

export interface BrandingAsset {
  bytes: Uint8Array<ArrayBuffer>
  contentType: string
  version: string
}

export interface BrandingAssetStore {
  get(slug: string, kind: BrandingKind): BrandingAsset | null
  put(slug: string, kind: BrandingKind, asset: BrandingAsset): void
}

export interface BuildAppOptions {
  /** Intent-routing decisions log; defaults to the on-disk JSONL store. */
  routing?: RoutingLog
  provider: RetrievalProvider
  /** Tenant registry; a fresh store (seeds only) when omitted. */
  tenants?: TenantStoreApi
  /** The live provider's management surface; absent in tests. */
  management?: AragProvider
  bindings?: BindingStoreApi
  insights?: InsightsStoreApi
  sessions?: SessionsStoreApi
  /** Source registry; shared with startScheduler in server.ts so a scheduled sync and a
   *  concurrent HTTP write don't clobber each other. A fresh store when omitted (tests). */
  sources?: SourceStoreApi
  /** Watch registry; same sharing rationale as `sources`. */
  watches?: WatchStoreApi
  investigations?: InvestigationStoreApi
  mcpKeys?: McpKeyStoreApi
  suggestions?: SuggestionStoreApi
  kgProposals?: KgProposalStoreApi
  /** Merchandising enrichment cache; a fresh store when omitted (tests). */
  enrichments?: EnrichmentStoreApi
  /** Runtime adapter for optional per-portal Worker custom domains. */
  domainProvisioner?: PortalDomainProvisioner | null
  zone?: string
  adminPasscode?: string
  /** A platform adapter may authenticate an administrator before the request reaches Hono. */
  trustedAdmin?: (request: Request) => boolean
  /** Authenticated portal identity forwarded by a trusted platform adapter. */
  trustedUser?: (request: Request) => TrustedPortalUser | null
  /** Where the built SPA lives; overridable in tests. Defaults to ./apps/web/dist. */
  webDistPath?: string
  /** Runtime adapters that serve assets outside the local filesystem set this explicitly. */
  webAvailable?: boolean
  /** Documentation readiness probe (docs-health.ts); reported on /api/health as `docs`. */
  docsHealth?: Pick<DocsHealth, 'snapshot' | 'ok' | 'checkTenant'>
  buildSha?: string
  /** Where uploaded branding assets live; overridable in tests. Defaults to BRANDING_PATH or ./data/branding. */
  brandingPath?: string
  branding?: BrandingAssetStore
  /** Called after a tenant is rebound so the provider can drop its caches. */
  invalidate?: (slug: string) => void
  /** Requests/min/IP for the paid-LLM routes (ask, generate, summarize, subqueries, verdicts,
   *  synthesise). Defaults to env RATE_LIMIT_ASK_PER_MIN, or 20. 0 disables. */
  rateLimitAskPerMin?: number
  /** Wider per-address cap behind the per-client limit (default 5x ask limit). */
  rateLimitAskPerMinPerIp?: number
  /** Requests/min/IP for POST /api/ask-estate, which fans one request across every tenant.
   *  Defaults to env RATE_LIMIT_ESTATE_PER_MIN, or 6. 0 disables. */
  rateLimitEstatePerMin?: number
  /** Authentication attempts/min/IP at the MCP endpoint. Defaults to 60. 0 disables. */
  rateLimitMcpAuthPerMin?: number
}

export function buildApp(opts: BuildAppOptions): Hono {
  const { provider } = opts
  const bindings = opts.bindings ?? new BindingStore({})
  const tenants = opts.tenants ?? new TenantStore({})
  const insights = opts.insights ?? new InsightsStore()
  const routing = opts.routing ?? new RoutingLog()
  const sessions = opts.sessions ?? new SessionsStore()
  const watches = opts.watches ?? new WatchStore()
  const sources = opts.sources ?? new SourceStore()
  const investigations = opts.investigations ?? new InvestigationStore()
  const mcpKeys = opts.mcpKeys ?? new McpKeyStore()
  const suggestions = opts.suggestions ?? new SuggestionStore()
  const kgProposals = opts.kgProposals ?? new KgProposalStore()
  const enrichments = opts.enrichments ?? new EnrichmentStore()
  const domains = opts.domainProvisioner === undefined
    ? createCloudflareDomainProvisioner(process.env)
    : opts.domainProvisioner
  const clientId = (c: Context): string => c.req.header('x-rp-client') ?? 'anonymous'
  const app = new Hono()
  // Stage-2 routing decisions, remembered per question so repeated routing is
  // deterministic (see the /route handler).
  const CLASSIFIER_CACHE_TTL_MS = 10 * 60_000
  const CLASSIFIER_CACHE_MAX = 500
  const classifierCache = new Map<string, { at: number; decision: RouteDecision }>()
  /** The tenant's routing context for a surface (docs/INTENT-ROUTING.md). */
  const routeContext = (config: TenantConfig, surface?: 'ask' | 'search'): RouteContext => {
    const intents = config.intents ?? []
    return {
      intents,
      defaultIntent: config.defaultIntent ?? intents[0]?.id ?? 'general',
      lexicon: config.entityTerms ?? [],
      ...(surface ? { surface } : {}),
    }
  }
  /**
   * Stage 2 of routing, shared by /route and an auto-routed /ask. The
   * platform's ask API silently ignores unknown top-level keys, so a
   * temperature or seed cannot be verified to reach the model; the
   * classifier is made deterministic here instead: the same question on
   * the same surface reuses its first decision for a while, and rules and
   * identifiers never reach the classifier at all.
   */
  const classify = async (
    config: TenantConfig,
    query: string,
    ctx: RouteContext,
    entities: string[],
  ): Promise<RouteDecision> => {
    const key = `${config.slug}|${ctx.surface ?? 'ask'}|${
      query.trim().toLowerCase().replace(/\s+/g, ' ')
    }`
    const remembered = classifierCache.get(key)
    if (remembered && Date.now() - remembered.at < CLASSIFIER_CACHE_TTL_MS) {
      return { ...remembered.decision, entities }
    }
    if (!opts.management) return defaultDecision(ctx, 'No routing rule matched', entities)
    try {
      const allowed = classifierIntents(ctx, query).map((i) => i.id)
      const raw = await Promise.race([
        opts.management.augmentationModel(config).then((model) =>
          opts.management!.classifyIntent(config, query, { model, allowed })
        ),
        new Promise<Record<string, never>>((resolve) => setTimeout(() => resolve({}), 12000)),
      ])
      const decision = decideFromClassifier(raw, ctx, entities, undefined, query)
      if (decision.stage === 'classifier') {
        if (classifierCache.size >= CLASSIFIER_CACHE_MAX) {
          const oldest = classifierCache.keys().next().value
          if (oldest !== undefined) classifierCache.delete(oldest)
        }
        classifierCache.set(key, { at: Date.now(), decision })
      }
      return decision
    } catch {
      return defaultDecision(
        ctx,
        'Classifier unavailable, using the default configuration',
        entities,
      )
    }
  }
  /** Every routing decision is logged; logging never blocks routing. */
  const recordRoute = (
    config: TenantConfig,
    query: string,
    decision: RouteDecision,
    latencyMs: number,
  ) => {
    try {
      routing.record(config.slug, {
        ts: new Date().toISOString(),
        questionHash: questionHash(query),
        questionLength: query.length,
        intent: decision.intent,
        stage: decision.stage,
        confidence: decision.confidence,
        rationale: decision.rationale,
        configuration: decision.configuration,
        latencyMs,
      })
    } catch {
      // logging never blocks routing
    }
  }
  // Suggested-question generations in flight, so a page that is opened twice
  // while its openers are being written costs one generation, not two.
  const questionsInFlight = new Map<string, Promise<string[]>>()

  // Rate limiting for the anonymous, paid-LLM routes - see rate-limit.ts.
  // Publishing this source open publishes the recipe for draining the
  // connected ARAG account unless every such route is throttled per caller.
  // Admin routes are passcode-gated separately and are NOT rate limited here.
  const askPerMin = opts.rateLimitAskPerMin ??
    Number(process.env.RATE_LIMIT_ASK_PER_MIN ?? 20)
  const estatePerMin = opts.rateLimitEstatePerMin ??
    Number(process.env.RATE_LIMIT_ESTATE_PER_MIN ?? 6)
  const expensiveLimiter = new SlidingWindowLimiter({ limit: askPerMin, windowMs: 60_000 })
  const estateLimiter = new SlidingWindowLimiter({ limit: estatePerMin, windowMs: 60_000 })
  // Per browser first (the web app's `x-rp-client` id), so a ward of users
  // behind one NAT address do not share a single budget; a second, wider
  // per-address bucket still caps a caller that mints ids to escape it.
  const askPerMinPerIp = opts.rateLimitAskPerMinPerIp ??
    Number(process.env.RATE_LIMIT_ASK_PER_MIN_IP ?? askPerMin * 5)
  const expensiveIpLimiter = new SlidingWindowLimiter({ limit: askPerMinPerIp, windowMs: 60_000 })
  const expensiveRateLimit = rateLimitLayered([
    { limiter: expensiveLimiter, keyFn: clientKey },
    { limiter: expensiveIpLimiter, keyFn: clientIp },
  ])
  const estateRateLimit = rateLimit(estateLimiter, clientIp)

  // Baseline security headers on every response. Deliberately narrow for now:
  // frame-ancestors only, not a full CSP - the app legitimately loads
  // modules from esm.sh and fonts from Google, so default-src/script-src is
  // a later work item once those origins are catalogued.
  app.use('*', async (c, next) => {
    await next()
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    c.header('Content-Security-Policy', "frame-ancestors 'none'")
  })

  // The SPA is served same-origin; no cross-origin API access is needed -
  // except reingest, where an admin's browser posts rendered HTML from the
  // source site's own origin (the passcode header still gates it).
  app.use(
    '/api/admin/t/*/reingest',
    cors({ origin: (origin) => origin, allowHeaders: ['content-type', 'x-admin-passcode'] }),
  )

  app.onError((err, c) => {
    if (err instanceof KnowledgeBoxNotConnectedError) {
      return c.json({ error: 'knowledge_box_not_connected', slug: err.slug }, 503)
    }
    console.error(err)
    return c.json({ error: 'internal_error' }, 500)
  })

  const tenant = (slug: string): TenantConfig | undefined => tenants.get(slug)

  registerMcpRoutes(app, {
    provider,
    tenant,
    keys: mcpKeys,
    trustedUser: opts.trustedUser,
    rateLimitPerMin: opts.rateLimitMcpAuthPerMin,
  })

  // Keep bookmarks for renamed portals and routes working. While an old tenant still exists it
  // remains authoritative; once it is retired, public portal routes permanently redirect to the
  // canonical slug. Renamed route segments redirect immediately. API calls stay untouched.
  app.use('/t/*', async (c, next) => {
    const location = tenantAliasLocation(
      c.req.raw,
      (slug, canonicalSlug) => !tenant(slug) && tenant(canonicalSlug) !== undefined,
    )
    if (!location) {
      await next()
      return
    }

    return c.redirect(location, 308)
  })

  /** Streamed errors must never carry internal URLs, box ids or upstream bodies. */
  const publicErrorMessage = (err: unknown): string => {
    if (err instanceof KnowledgeBoxNotConnectedError) {
      return 'This portal is not connected to its content yet.'
    }
    const message = err instanceof Error ? err.message : ''
    const status = /Agentic RAG API (\d+)/.exec(message)?.[1]
    if (status) return `The answer service had a problem (HTTP ${status}) - please try again.`
    return 'The answer service had a problem - please try again.'
  }

  /**
   * Ingestion writes (link/text/upload) can hit the platform's processing
   * queue back-pressure (HTTP 429) even after the provider's own bounded
   * retry - the queue is still full a few seconds later. That is not a bug,
   * it's the platform under load, so it must never surface as a bare 500.
   * Returns the 503 body to send when `err` is that condition, else null so
   * the caller can rethrow anything genuinely unexpected.
   */
  const ingestionBusyBody = (err: unknown) =>
    err instanceof AragApiError && err.backpressure
      ? {
        error: 'ingestion_busy' as const,
        message: 'The knowledge box is busy processing recent changes and cannot accept new ' +
          'content right now - please try again in a few minutes.',
        retryAfter: err.backpressure.tryAfter,
      }
      : null

  /**
   * The other way an ingestion write fails for a reason that is not a bug:
   * the box's service-account token has read scope only, so every write comes
   * back a bare 403 `{"detail":"Forbidden"}` while retrieval keeps working
   * perfectly. Surfaced as a plain 500 `internal_error` this is close to
   * undiagnosable from the admin UI - the box looks healthy, content just
   * never appears. Name it instead. Returns the body to send, else null.
   */
  const readOnlyBoxBody = (err: unknown) =>
    err instanceof AragApiError && (err.status === 401 || err.status === 403)
      ? { error: 'read_only_box' as const, message: READ_ONLY_BOX_MESSAGE }
      : null

  /** Both ingestion guards in the order they should be tried, or null. */
  const ingestErrorResponse = (err: unknown) => {
    const busy = ingestionBusyBody(err)
    if (busy) return { body: busy, status: 503 as const }
    const readOnly = readOnlyBoxBody(err)
    if (readOnly) return { body: readOnly, status: 403 as const }
    return null
  }

  // Unauthenticated liveness/readiness check for Fly's health checker - no
  // upstream/ARAG calls. Also verifies the SPA bundle is present, so an
  // image built without `deno task build:web` fails health checks instead
  // of shipping a 404-everywhere deploy (the bug this endpoint exists for).
  const webDistPath = opts.webDistPath ?? './apps/web/dist'
  app.get('/api/health', (c) => {
    const web = opts.webAvailable ?? existsSync(`${webDistPath}/index.html`)
    // Documentation readiness (see docs-health.ts): a portal whose in-app
    // documentation was never ingested answers every route fine while Help
    // returns nothing. It is reported here, per portal, so a deploy without
    // docs is visible - but it never fails liveness, so a missing help
    // section cannot take a serving portal out of rotation.
    const docs = opts.docsHealth?.snapshot()
    const docsOk = opts.docsHealth?.ok() ?? true
    return c.json(
      {
        ok: web,
        web,
        version: opts.buildSha ?? process.env.BUILD_SHA ?? 'dev',
        ...(docs ? { docs, docsOk } : {}),
      },
      web ? 200 : 503,
    )
  })

  app.get('/api/tenants', (c) => c.json(tenants.list()))

  const brandingDir = opts.brandingPath ?? process.env.BRANDING_PATH ?? './data/branding'
  const BRANDING_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'svg'] as const
  const BRANDING_FONT_EXTS = ['woff2', 'woff', 'ttf', 'otf'] as const
  const isBrandingKind = (kind: string): kind is BrandingKind =>
    kind === 'logo' || kind === 'hero' || kind === 'font-heading' || kind === 'font-body'
  const brandingExts = (kind: BrandingKind): readonly string[] =>
    kind === 'logo' || kind === 'hero' ? BRANDING_IMAGE_EXTS : BRANDING_FONT_EXTS
  const brandingFile = (slug: string, kind: BrandingKind): string | null => {
    for (const ext of brandingExts(kind)) {
      const path = `${brandingDir}/${slug}-${kind}.${ext}`
      if (existsSync(path)) return path
    }
    return null
  }
  // mtime-versioned so replacing a file behind the stable path busts caches.
  const brandingUrl = (slug: string, kind: BrandingKind): string | null => {
    if (opts.branding) {
      const asset = opts.branding.get(slug, kind)
      return asset ? `/api/t/${slug}/branding/${kind}?v=${asset.version}` : null
    }
    const path = brandingFile(slug, kind)
    if (!path) return null
    return `/api/t/${slug}/branding/${kind}?v=${Math.round(statSync(path).mtimeMs)}`
  }
  const withBrandingUrls = (config: TenantConfig): TenantConfig => {
    const logo = brandingUrl(config.slug, 'logo')
    const hero = brandingUrl(config.slug, 'hero')
    const headingFont = brandingUrl(config.slug, 'font-heading')
    const bodyFont = brandingUrl(config.slug, 'font-body')
    return {
      ...config,
      branding: {
        ...config.branding,
        ...(logo ? { logoUrl: logo } : {}),
        ...(hero ? { heroImageUrl: hero } : {}),
        ...(headingFont ? { headingFontUrl: headingFont } : {}),
        ...(bodyFont ? { bodyFontUrl: bodyFont } : {}),
      },
    }
  }

  app.get('/api/t/:slug/config', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    return c.json(withBrandingUrls(config))
  })

  app.get('/api/t/:slug/branding/:kind', (c) => {
    const config = tenant(c.req.param('slug'))
    const kind = c.req.param('kind')
    if (!config || !isBrandingKind(kind)) {
      return c.json({ error: 'not_found' }, 404)
    }
    const stored = opts.branding?.get(config.slug, kind)
    if (stored) {
      return new Response(stored.bytes, {
        headers: { 'content-type': stored.contentType, 'cache-control': 'public, max-age=300' },
      })
    }
    const path = brandingFile(config.slug, kind)
    if (!path) return c.json({ error: 'not_found' }, 404)
    const ext = path.split('.').pop() ?? 'png'
    const type = ext === 'svg'
      ? 'image/svg+xml'
      : ext === 'webp'
      ? 'image/webp'
      : ext === 'woff2' || ext === 'woff' || ext === 'ttf' || ext === 'otf'
      ? `font/${ext}`
      : `image/${ext === 'jpg' ? 'jpeg' : ext}`
    return new Response(readFileSync(path), {
      headers: { 'content-type': type, 'cache-control': 'public, max-age=300' },
    })
  })

  app.get('/api/t/:slug/resources/:id/thumbnail', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'not_found' }, 404)
    const upstream = await opts.management.thumbnailResponse(config, c.req.param('id'))
    if (!upstream) return c.json({ error: 'not_found' }, 404)
    const headers = new Headers()
    for (const name of ['content-type', 'content-length', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    // A processed resource's thumbnail is stable, but not strictly immutable:
    // keep it fresh for a day, then allow a stale image while caches revalidate.
    headers.set('cache-control', 'public, max-age=86400, stale-while-revalidate=604800')
    return new Response(upstream.body, { status: 200, headers })
  })

  app.get('/api/t/:slug/search', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = searchQuerySchema.safeParse({ q: c.req.query('q') })
    if (!parsed.success) return c.json({ error: 'missing_query' }, 400)
    const modeRaw = c.req.query('mode')
    const mode = modeRaw === 'semantic' || modeRaw === 'keyword' ? modeRaw : 'hybrid'
    const topicIds = (c.req.query('topics') ?? '').split(',').filter(Boolean)
    const kindIds = (c.req.query('kinds') ?? '').split(',').filter(Boolean)
    const intents = config.intents ?? []
    const intentParam = c.req.query('intent') || undefined
    if (intentParam && !intents.some((i) => i.id === intentParam)) {
      return c.json({ error: 'unknown_intent' }, 400)
    }
    // Routing for a listing is the rule stage alone, run here: an exact
    // lookup (an identifier, a gene symbol, a lexicon term) is decided in
    // microseconds and the results never wait on a classifier, which chose
    // a supplements-only configuration for plain searches and emptied the
    // list. Only the hybrid mode takes a rule - a stored configuration's
    // features would make the mode switch inert.
    const ctx = routeContext(config, 'search')
    const listing = intents.find((i) => i.answer.strategy === 'none')
    const byRule = intents.length > 0 && !intentParam && mode === 'hybrid'
      ? routeByRules(parsed.data.q, ctx)
      : null
    let route = byRule && byRule.intent !== ctx.defaultIntent ? byRule : undefined
    // Identifiers and author surnames resolve against catalogue metadata
    // before any retrieval: a DOI names one document or nothing, and the
    // platform has no author index of its own.
    const identifier = parseIdentifier(parsed.data.q)
    if (identifier) {
      const catalogue = await provider.listResources(config).catch(() => [])
      const hits = resolveIdentifier(catalogue, identifier)
      const label = identifier.kind === 'doi' ? 'DOI' : identifier.kind.toUpperCase()
      return c.json(merchandiseSearchResults(enrichments, config.slug, {
        query: parsed.data.q,
        resources: hits.map((hit) =>
          metadataHit(
            hit,
            `${label} ${identifier.kind === 'doi' && hit.doi ? hit.doi : identifier.value}`,
          )
        ),
        relatedQuestions: [],
        lookup: lookupOf(identifier.kind, identifier.value, hits.length > 0),
        ...(route ? { route } : {}),
      }))
    }
    const catalogue = await provider.listResources(config).catch(() => [])
    const byAuthor = resolveAuthor(catalogue, parsed.data.q)
    const searchIntent = intentParam ?? route?.intent
    const searchWith = (intent: string | undefined) =>
      provider.search(config, parsed.data.q, {
        mode,
        topicIds,
        kindIds,
        ...(intent ? { intent } : {}),
      })
    let results = await searchWith(searchIntent)
    // An intent narrower than the default that finds nothing is not an
    // answer for a listing: the default configuration lists what the
    // corpus holds. An exact lookup keeps its honest empty result.
    if (searchIntent && searchIntent !== listing?.id && results.resources.length === 0) {
      results = await searchWith(undefined)
      route = undefined
    }
    if (byAuthor) {
      const already = new Set(results.resources.map((r) => r.id))
      const authored = byAuthor.matches
        .filter((r) => !already.has(r.id))
        .map((r) => metadataHit(r, authorLine(r)))
      // The author's papers are a catalogue lookup, decided without the
      // box: the chip says so, and the surface lists rather than answers.
      const authorRoute: RouteDecision | undefined = listing
        ? {
          intent: listing.id,
          confidence: 1,
          stage: 'rule',
          rationale: `${listing.label}: papers by ${byAuthor.surname} from the catalogue`,
          configuration: 'catalogue',
          entities: [byAuthor.surname],
          rule: 'author',
        }
        : undefined
      return c.json(merchandiseSearchResults(enrichments, config.slug, {
        ...results,
        resources: [...authored, ...results.resources],
        lookup: lookupOf('author', byAuthor.surname, true),
        ...(authorRoute ? { route: authorRoute } : {}),
      }))
    }
    return c.json(merchandiseSearchResults(enrichments, config.slug, {
      ...results,
      ...(route ? { route } : {}),
    }))
  })

  // Intent routing: which stored search configuration should answer this
  // question. Rules first (free, explainable), then one short classification
  // on the platform when no rule fires. Every decision is logged.
  app.post('/api/t/:slug/route', expensiveRateLimit, async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = routeBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_query' }, 400)
    const intents = config.intents ?? []
    const ctx = routeContext(config, parsed.data.surface)
    const started = Date.now()
    let decision = intents.length > 0 ? routeByRules(parsed.data.query, ctx) : null
    if (!decision && intents.length > 0) {
      const entities = extractEntities(parsed.data.query, ctx.lexicon)
      decision = await classify(config, parsed.data.query, ctx, entities)
    }
    if (!decision) decision = defaultDecision(ctx, 'This portal has no intents configured')
    const latencyMs = Date.now() - started
    recordRoute(config, parsed.data.query, decision, latencyMs)
    return c.json({ ...decision, latencyMs })
  })

  // ---------------------------------------------------------------------
  // Extraction Lab (docs/EXTRACTION-LAB.md): sandbox methods, profiling, a
  // streamed comparison, and the routing rules a portal stores.
  // ---------------------------------------------------------------------
  app.get('/api/admin/t/:slug/extraction/methods', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const lab = labTenant(config)
    try {
      const methods = await ensureLabMethods(management!, lab)
      return c.json({
        lab: lab.slug,
        available: true,
        methods,
        rules: config.extraction ?? null,
        poppler: await popplerAvailable(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unavailable'
      return c.json({
        lab: lab.slug,
        available: false,
        methods: [],
        rules: config.extraction ?? null,
        poppler: await popplerAvailable(),
        message,
      })
    }
  })
  app.post('/api/admin/t/:slug/extraction/profile', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const parsed = extractionProfileSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    try {
      return c.json(await profileResource(management!, config, parsed.data.resourceId))
    } catch (err) {
      return c.json({
        error: 'profile_failed',
        message: err instanceof Error ? err.message : 'failed',
      }, 502)
    }
  })
  app.post('/api/admin/t/:slug/extraction/compare', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const parsed = extractionCompareSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    return streamSSE(c, async (stream) => {
      try {
        for await (const event of compareExtraction(management!, config, parsed.data)) {
          await stream.writeSSE({ data: JSON.stringify(event) })
        }
      } catch (err) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            message: err instanceof Error ? err.message : 'failed',
          }),
        })
      }
    })
  })
  app.put('/api/admin/t/:slug/extraction/rules', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const parsed = ExtractionRulesSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    tenants.patch(config.slug, { extraction: parsed.data })
    return c.json({ ok: true, rules: parsed.data })
  })

  /** Recent routing decisions and a summary - the Manage panel's audit view. */
  app.get('/api/admin/t/:slug/routing', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    return c.json({
      recent: routing.recent(config.slug, 50),
      summary: routing.summary(config.slug),
    })
  })

  // Documentation-scoped search (the Help section). Retrieves ONLY the in-app
  // documentation via the doc-scoped stored config + server-side cross-check;
  // never touches the research corpus. Not merchandised - doc pages carry no
  // research enrichments.
  app.get('/api/t/:slug/docs/search', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = searchQuerySchema.safeParse({ q: c.req.query('q') })
    if (!parsed.success) return c.json({ error: 'missing_query' }, 400)
    const results = await provider.search(config, parsed.data.q, { docScope: true })
    return c.json(results)
  })

  app.get('/api/t/:slug/catalog', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const sortRaw = c.req.query('sort')
    const orderRaw = c.req.query('order')
    // Each facet accepts its documented name and the short form the web
    // client sends (`kindIds=` or `kind=`), so a hand-written URL filters
    // instead of silently returning the whole corpus.
    const ids = (...names: string[]): string[] =>
      (names.map((n) => c.req.query(n)).find((v) => v !== undefined) ?? '')
        .split(',')
        .filter(Boolean)
    const page = await provider.catalog(config, {
      kindIds: ids('kind', 'kindIds', 'kinds'),
      formatIds: ids('format', 'formatIds', 'formats'),
      page: Math.max(0, Math.floor(Number(c.req.query('page') ?? 0) || 0)),
      pageSize: Math.min(
        Math.max(1, Math.floor(Number(c.req.query('pageSize') ?? 24) || 24)),
        100,
      ),
      query: c.req.query('q') || undefined,
      topicIds: ids('topics', 'topicIds', 'topic'),
      sortField: sortRaw === 'modified' || sortRaw === 'title' || sortRaw === 'published'
        ? sortRaw
        : 'created',
      sortOrder: orderRaw === 'asc' ? 'asc' : 'desc',
    })
    return c.json(merchandiseCatalogPage(enrichments, config.slug, page))
  })

  app.get('/api/t/:slug/topics/:topicId/resources', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const limit = Math.min(Math.max(1, Math.floor(Number(c.req.query('limit') ?? 12) || 12)), 24)
    const items = await provider.topicResources(config, c.req.param('topicId'), limit)
    return c.json(merchandiseSummaries(enrichments, config.slug, items))
  })

  // One facet aggregation serves every rail - Search, Library, Taxonomy and
  // the raw endpoint - so their counts agree. Each labelset's counts are
  // memoised per tenant for a short window; a request only goes to the
  // platform for the labelsets it has not seen in that window. The
  // `untagged` entry is the real no-label count from the index (topics are
  // multi-valued, so resources minus the sum of topic counts is wrong).
  const FACET_MEMO_MS = 30_000
  const facetMemo = new Map<string, { at: number; counts: Record<string, number> }>()
  const untaggedMemo = new Map<string, { at: number; count: number }>()
  async function facetsFor(config: TenantConfig, labelsets: string[]): Promise<FacetCounts> {
    const now = Date.now()
    const out: FacetCounts = {}
    const missing: string[] = []
    for (const ls of labelsets) {
      const hit = facetMemo.get(`${config.slug}:${ls}`)
      if (hit && now - hit.at < FACET_MEMO_MS) out[ls] = hit.counts
      else missing.push(ls)
    }
    if (missing.length > 0) {
      const fresh = await provider.facets(config, missing)
      for (const ls of missing) {
        const counts = fresh[ls] ?? {}
        out[ls] = counts
        facetMemo.set(`${config.slug}:${ls}`, { at: now, counts })
      }
    }
    if (labelsets.includes('topic') && provider.untaggedCount) {
      const hit = untaggedMemo.get(config.slug)
      let count = hit && now - hit.at < FACET_MEMO_MS ? hit.count : undefined
      if (count === undefined) {
        try {
          count = await provider.untaggedCount(config, 'topic')
          untaggedMemo.set(config.slug, { at: now, count })
        } catch {
          // The count is a courtesy row; the facets themselves still serve.
        }
      }
      if (count !== undefined) out.untagged = { topic: count }
    }
    return out
  }

  app.get('/api/t/:slug/facets', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    // The documented name and the short form both work; by default the three
    // facets every rail shows come back together.
    const requested = c.req.query('labelsets') ?? c.req.query('ls') ?? 'topic,kind,format'
    const labelsets = [...new Set(requested.split(',').filter(Boolean))]
    return c.json(await facetsFor(config, labelsets))
  })

  app.get('/api/t/:slug/labelsets', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    return c.json(await provider.labelsets(config))
  })

  app.get('/api/t/:slug/suggest', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const q = c.req.query('q')?.trim()
    return c.json(await provider.suggest(config, q || undefined))
  })

  app.get('/api/t/:slug/resources', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    return c.json(
      merchandiseSummaries(enrichments, config.slug, await provider.listResources(config)),
    )
  })

  app.get('/api/t/:slug/resources/:id', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const resource = await provider.resource(config, c.req.param('id'))
    if (!resource) return c.json({ error: 'unknown_resource' }, 404)
    return c.json(merchandiseSummary(enrichments, config.slug, resource))
  })

  // Openers written from this document, cached under their own schema id in the
  // same store as enrichments. Falls back to [] (the page shows its generic
  // three) rather than failing the page - suggestions are a nicety.
  app.get('/api/t/:slug/resources/:id/questions', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const id = c.req.param('id')

    const cached = enrichments.get(config.slug, id, SUGGESTED_QUESTIONS_SCHEMA_ID)
    const cachedQuestions = cached?.data?.questions
    if (Array.isArray(cachedQuestions)) return c.json({ questions: cachedQuestions })

    if (!opts.management) return c.json({ questions: [] })
    const resource = await provider.resource(config, id).catch(() => null)
    if (!resource) return c.json({ error: 'unknown_resource' }, 404)
    // Openers are precomputed at enrichment time; a resource the pass has not
    // reached yet gets its openers written in the background and answers
    // `pending` now, so the page never waits eight to ten seconds on them.
    // `wait=1` keeps the old blocking behaviour for callers that need it.
    const key = `${config.slug}/${id}`
    let job = questionsInFlight.get(key)
    if (!job) {
      const merchandised = merchandiseSummary(enrichments, config.slug, resource)
      job = generateSuggestedQuestions(
        opts.management,
        config,
        id,
        merchandised.title,
        merchandised.summary,
      ).then((questions) => {
        // Cache the empty result too: a document that yields nothing (a scan
        // with no extractable text) would otherwise pay for generation on
        // every view.
        enrichments.put(config.slug, id, {
          schemaId: SUGGESTED_QUESTIONS_SCHEMA_ID,
          generatedAt: new Date().toISOString(),
          data: { questions },
        })
        return questions
      }).finally(() => questionsInFlight.delete(key))
      questionsInFlight.set(key, job)
      // A background job's failure is a missed nicety, never an unhandled rejection.
      job.catch(() => {})
    }
    if (c.req.query('wait') === '1') return c.json({ questions: await job.catch(() => []) })
    return c.json({ questions: [], pending: true })
  })

  app.get('/api/t/:slug/resources/:id/content', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const content = await opts.management.resourceContent(config, c.req.param('id'))
    if (!content) return c.json({ error: 'unknown_resource' }, 404)
    return c.json(merchandiseContent(enrichments, config.slug, content))
  })

  app.get('/api/t/:slug/resources/:id/file/:fieldId', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const upstream = await opts.management.fileStream(
      config,
      c.req.param('id'),
      c.req.param('fieldId'),
      c.req.header('range'),
    )
    const headers = new Headers()
    for (
      const h of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'etag',
        'last-modified',
      ]
    ) {
      const v = upstream.headers.get(h)
      if (v) headers.set(h, v)
    }
    headers.set('content-disposition', 'inline')
    return new Response(upstream.body, { status: upstream.status, headers })
  })

  app.get('/api/t/:slug/typeahead', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const q = (c.req.query('q') ?? '').trim()
    if (!opts.management || q.length < 2) return c.json({ entities: [], titles: [] })
    return c.json(await opts.management.typeahead(config, q))
  })

  app.get('/api/t/:slug/graph/relations', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ nodes: [], edges: [] })
    const entity = c.req.query('entity')?.trim()
    const includeBuiltin = ['true', '1'].includes(
      (c.req.query('includeBuiltin') ?? '').trim().toLowerCase(),
    )
    const graph = await opts.management.relationsGraph(config, {
      ...(entity ? { entity, topK: 150 } : {}),
      ...(includeBuiltin ? { includeBuiltin } : {}),
    })
    // An empty graph with a registered agent means extraction is in flight -
    // the page should say so rather than telling users to configure it.
    let extracting = false
    if (graph.edges.length === 0) {
      try {
        const agents = await opts.management.listAgents(config)
        extracting = agents.some((agent) => agent.task === 'llm-graph')
      } catch {
        // status stays false
      }
    }
    return c.json({ ...graph, extracting })
  })

  app.get('/api/t/:slug/entities', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json([])
    return c.json(await opts.management.entityGroups(config))
  })

  app.get('/api/t/:slug/knowledge-box', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    return c.json(bindings.status(config.slug))
  })

  app.get('/api/t/:slug/counters', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    return c.json(await opts.management.counters(config))
  })

  app.get('/api/t/:slug/graph', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const primary = c.req.query('primary') ?? 'topic'
    const secondary = c.req.query('secondary') ?? 'kind'
    return c.json(await opts.management.graphData(config, primary, secondary))
  })

  app.post('/api/t/:slug/generate', expensiveRateLimit, async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const parsed = generateBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const schema = GENERATE_SCHEMAS[parsed.data.kind]
    try {
      // Grounding gate: the structured-artefact equivalent of /ask's honest
      // refusal. Structured generation has no textual guardrail to detect
      // (the model only ever returns valid JSON, fabricated or not), so the
      // gate runs on retrieval relevance instead - see askStructured's
      // requireGrounding. On a thin or broken corpus (e.g. a source that
      // ingested cleanly as a resource but is actually a bot-check page)
      // this refuses rather than producing a fluent, plausible artefact from
      // background knowledge with real-looking citations to junk sources.
      // Briefings and quizzes carry writing instructions on the system
      // prompt: concrete figures and a named source per section or question
      // (generate-sources.ts). The other kinds keep the platform default.
      const instructions = parsed.data.kind === 'briefing'
        ? BRIEFING_INSTRUCTIONS
        : parsed.data.kind === 'assessment'
        ? ASSESSMENT_INSTRUCTIONS
        : undefined
      const result = await opts.management.askStructured(config, schema, parsed.data.query, {
        requireGrounding: true,
        ...(instructions ? { instructions } : {}),
      })
      // Merchandise the answer surface's own sources the same way /search,
      // /catalog and /resources are - see BUG 1: the enrichment store lives
      // only in this app layer, so the provider's `sources` still carry
      // baseline-only (possibly raw filename/project-code) titles.
      result.sources = merchandiseSources(enrichments, config.slug, result.sources)
      if (result.insufficientGrounding) {
        return c.json({
          kind: parsed.data.kind,
          insufficientGrounding: true,
          message: `There is not enough source material in this portal to generate a grounded ${
            GENERATE_SCHEMAS[parsed.data.kind].label
          } on this topic. Try a broader topic or check the Library for coverage.`,
          sources: result.sources,
        })
      }
      // A briefing section stands only on sources that were actually
      // retrieved: model-named titles resolve to resource ids, and a section
      // nothing supports is withheld and listed as omitted (P6-07). A quiz
      // question's source resolves the same way (P8-11).
      if (parsed.data.kind === 'briefing' && result.object && typeof result.object === 'object') {
        const attributed = attributeBriefing(
          result.object as Record<string, unknown>,
          result.sources,
        )
        if (attributed.sections.length === 0) {
          return c.json({
            kind: parsed.data.kind,
            insufficientGrounding: true,
            message: 'None of the briefing could be attributed to a retrieved source, so it was ' +
              'withheld rather than presented unsourced. Try a narrower topic or check the ' +
              'Library for coverage.',
            sources: result.sources,
          })
        }
        result.object = attributed
      }
      if (
        parsed.data.kind === 'assessment' && result.object && typeof result.object === 'object'
      ) {
        result.object = attributeQuiz(
          result.object as Record<string, unknown>,
          result.sources,
          result.passagesByResource,
        )
      }
      // Comparison cells that came back empty get one targeted second look -
      // "Not specified" must mean the corpus is silent, not that retrieval
      // for the broad query missed it.
      if (parsed.data.kind === 'comparison') {
        const object = result.object as {
          items?: {
            name?: string
            ratings?: { dimension?: string; assessment?: string; source?: string }[]
          }[]
        }
        // No invented citations: a per-cell "source" must name a source that
        // was actually retrieved for this query - matched against both the
        // merchandised title and the raw source name/filename (the model's
        // own attribution more often echoes the corpus's raw naming than the
        // merchandised headline). A cell that cannot be reliably attributed
        // has its `source` field DROPPED entirely rather than shown as an
        // empty string - an empty attribution is never presented as if it
        // were a real one (BUG 4: prefer honest omission).
        const knownTitles = result.sources
          .flatMap((s) => [s.title, s.sourceName])
          .filter((t): t is string => Boolean(t))
          .map((t) => t.toLowerCase().trim())
        for (const item of object.items ?? []) {
          for (const rating of item.ratings ?? []) {
            if (!rating.source?.trim() || !sourceIsKnown(rating.source, knownTitles)) {
              delete rating.source
            }
          }
        }
        const empties: { item: string; rating: { assessment?: string }; dimension: string }[] = []
        for (const item of object.items ?? []) {
          for (const rating of item.ratings ?? []) {
            if (/^\s*(not specified|unknown|n\/?a|no data)/i.test(rating.assessment ?? '')) {
              empties.push({
                item: item.name ?? '',
                rating,
                dimension: rating.dimension ?? '',
              })
            }
          }
        }
        const CELL_SCHEMA = {
          name: 'cell_fill',
          description: 'A single comparison-cell assessment',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: { assessment: { type: 'string' }, found: { type: 'boolean' } },
            required: ['assessment', 'found'],
          },
        }
        await Promise.all(
          empties.slice(0, 4).map(async (cell) => {
            try {
              const fill = await opts.management!.askStructured(
                config,
                CELL_SCHEMA,
                `What does the corpus say about the ${cell.dimension} of ${cell.item}? ` +
                  'Answer in one or two sentences with specifics (figures, findings). ' +
                  'Set found=false and assessment="Not specified in the corpus" only if genuinely absent.',
              )
              const filled = fill.object as { assessment?: string; found?: boolean }
              if (filled.found && filled.assessment?.trim()) {
                cell.rating.assessment = filled.assessment
              }
            } catch {
              // the cell keeps its honest "Not specified"
            }
          }),
        )
      }
      return c.json({ kind: parsed.data.kind, ...result })
    } catch (err) {
      const text = err instanceof Error ? err.message : ''
      const status = err instanceof AragApiError ? err.status : 0
      const message = /max_tokens|token|json/i.test(text) || status === 412 || status === 422
        ? 'The request was too large to generate - try a narrower or simpler ask.'
        : 'Generation failed - please try again.'
      return c.json({ error: 'generation_failed', message }, 502)
    }
  })

  app.post('/api/t/:slug/feedback', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const parsed = feedbackBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    try {
      await opts.management.feedback(config, parsed.data)
      return c.json({ ok: true })
    } catch {
      return c.json({ error: 'feedback_failed' }, 502)
    }
  })

  app.post('/api/t/:slug/summarize', expensiveRateLimit, async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const parsed = summarizeBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    try {
      const summary = await opts.management.summarize(
        config,
        parsed.data.resourceIds,
        parsed.data.kind ?? 'simple',
      )
      if (!summary.trim()) return c.json({ error: 'empty_summary' }, 502)
      return c.json({ summary })
    } catch {
      return c.json({ error: 'summarize_failed' }, 502)
    }
  })

  app.post('/api/t/:slug/subqueries', expensiveRateLimit, async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const parsed = subqueriesBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    try {
      const result = await opts.management.askStructured(
        config,
        SUBQUERIES_SCHEMA,
        `Break this research question into 3 to 5 focused sub-questions that together cover it fully. Sub-questions must be answerable from the corpus and phrased as standalone questions: ${parsed.data.query}`,
      )
      const questions = ((result.object as { questions?: unknown }).questions ?? []) as string[]
      return c.json({
        questions: questions.filter((q) => typeof q === 'string' && q.trim().length > 3).slice(
          0,
          5,
        ),
      })
    } catch {
      return c.json({ questions: [] })
    }
  })

  // Entity dossier: the graph neighbourhood plus the resources that discuss it.
  app.get('/api/t/:slug/entity', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const name = c.req.query('name')?.trim()
    if (!name) return c.json({ error: 'invalid_request' }, 400)
    // Relations scoped to the entity itself (the platform's path filter), not
    // filtered out of the corpus-wide slice - a gene outside the top 120 used
    // to read as "no connections" while the map showed it.
    const [graph, results] = await Promise.all([
      opts.management.relationsGraph(config, { entity: name, topK: 150 }).catch(() => ({
        nodes: [],
        edges: [],
      })),
      provider.search(config, name, { mode: 'hybrid', pageSize: 12 }).catch(() => null),
    ])
    const lower = name.toLowerCase()
    const neighbourIds = new Set<string>()
    const edges = graph.edges.filter((e) => {
      const hit = e.source.toLowerCase() === lower || e.target.toLowerCase() === lower
      if (hit) {
        neighbourIds.add(e.source)
        neighbourIds.add(e.target)
      }
      return hit
    })
    const resources = (results?.resources ?? [])
      .filter((r) => r.relevance >= 0.3)
      .map((r) => merchandiseScored(enrichments, config.slug, r))
    // Nothing in the graph and nothing in the corpus: this is not an entity
    // the portal knows, and the page must be able to say so.
    if (edges.length === 0 && resources.length === 0) {
      return c.json({ error: 'unknown_entity', name, unknown: true }, 404)
    }
    return c.json({
      name,
      relations: { nodes: graph.nodes.filter((n) => neighbourIds.has(n.id)), edges },
      resources,
    })
  })

  // --- Research-trail sessions, synced server-side per anonymous client ----

  app.get('/api/t/:slug/sessions', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    return c.json(sessions.list(config.slug, clientId(c)))
  })

  app.get('/api/t/:slug/sessions/:id', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const session = sessions.get(config.slug, clientId(c), c.req.param('id'))
    return session ? c.json(session) : c.json({ error: 'not_found' }, 404)
  })

  app.put('/api/t/:slug/sessions/:id', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = sessionPutSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success || parsed.data.id !== c.req.param('id')) {
      return c.json({ error: 'invalid_request' }, 400)
    }
    if (JSON.stringify(parsed.data).length > 2 * 1024 * 1024) {
      return c.json({ error: 'session_too_large' }, 413)
    }
    const existing = sessions.list(config.slug, clientId(c))
    if (existing.length >= 200 && !existing.some((s) => s.id === parsed.data.id)) {
      return c.json({ error: 'too_many_sessions' }, 429)
    }
    sessions.put(config.slug, clientId(c), parsed.data)
    return c.json({ ok: true })
  })

  app.delete('/api/t/:slug/sessions/:id', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    sessions.remove(config.slug, clientId(c), c.req.param('id'))
    return c.json({ ok: true })
  })

  // --- Saved searches / watches --------------------------------------------

  app.get('/api/t/:slug/watches', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    return c.json(watches.list(config.slug, clientId(c)))
  })

  app.post('/api/t/:slug/watches', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = watchBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    return c.json(watches.add(config.slug, clientId(c), parsed.data.query))
  })

  app.post('/api/t/:slug/watches/:id/seen', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    watches.update(config.slug, c.req.param('id'), { changed: false }, clientId(c))
    return c.json({ ok: true })
  })

  app.delete('/api/t/:slug/watches/:id', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    watches.remove(config.slug, clientId(c), c.req.param('id'))
    return c.json({ ok: true })
  })

  // Federated ask: stream one grounded answer per enabled portal.
  app.post('/api/ask-estate', estateRateLimit, async (c) => {
    const parsed = estateAskSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_query' }, 400)
    const targets = tenants.list().map((t) => tenants.get(t.slug)).filter(
      (t): t is TenantConfig => t !== undefined,
    )
    return streamSSE(c, async (stream) => {
      let chain: Promise<void> = Promise.resolve()
      const write = (slug: string, event: unknown) => {
        chain = chain.then(() => stream.writeSSE({ data: JSON.stringify({ slug, event }) }))
        return chain
      }
      await Promise.all(targets.map(async (config) => {
        const record = { citations: 0, groundedness: null as number | null, failed: false }
        try {
          for await (const event of provider.ask(config, parsed.data.query, {})) {
            if (event.type === 'citation') record.citations += 1
            if (event.type === 'quality') record.groundedness = event.groundedness
            if (event.type === 'error') record.failed = true
            if (
              event.type === 'delta' || event.type === 'done' || event.type === 'sources' ||
              event.type === 'quality' || event.type === 'error'
            ) {
              await write(config.slug, event)
            }
          }
        } catch (err) {
          record.failed = true
          await write(config.slug, {
            type: 'error',
            message: publicErrorMessage(err),
          })
        }
        try {
          // Estate asks count in each portal's insights too - same signal.
          insights.record(config.slug, {
            ts: new Date().toISOString(),
            question: parsed.data.query.slice(0, 500),
            answered: !record.failed && record.citations > 0,
            citations: record.citations,
            durationSec: null,
            answerRelevance: null,
            groundedness: record.groundedness,
            contextRelevance: null,
          })
        } catch {
          // best-effort
        }
      }))
      await chain
      await stream.writeSSE({
        data: JSON.stringify({ slug: null, event: { type: 'estate-done' } }),
      })
    })
  })

  // --- Investigations: the research workspace, per anonymous client --------

  app.get('/api/t/:slug/investigations', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    return c.json(investigations.list(config.slug, clientId(c)))
  })

  app.post('/api/t/:slug/investigations', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = investigationCreateSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    if (investigations.list(config.slug, clientId(c)).length >= 100) {
      return c.json({ error: 'too_many_investigations' }, 429)
    }
    return c.json(investigations.create(config.slug, clientId(c), parsed.data))
  })

  app.get('/api/t/:slug/investigations/:id', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const investigation = investigations.get(config.slug, clientId(c), c.req.param('id'))
    return investigation ? c.json(investigation) : c.json({ error: 'not_found' }, 404)
  })

  app.patch('/api/t/:slug/investigations/:id', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = investigationPatchSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const updated = investigations.update(config.slug, clientId(c), c.req.param('id'), parsed.data)
    return updated ? c.json(updated) : c.json({ error: 'not_found' }, 404)
  })

  app.delete('/api/t/:slug/investigations/:id', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    investigations.remove(config.slug, clientId(c), c.req.param('id'))
    return c.json({ ok: true })
  })

  app.post('/api/t/:slug/investigations/:id/evidence', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = evidenceCreateSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const item = investigations.addEvidence(config.slug, clientId(c), c.req.param('id'), {
      passage: parsed.data.passage,
      resourceId: parsed.data.resourceId,
      resourceTitle: parsed.data.resourceTitle,
      score: parsed.data.score ?? null,
      question: parsed.data.question ?? '',
      verdict: parsed.data.verdict ?? null,
      aiRelevance: parsed.data.aiRelevance ?? null,
      note: parsed.data.note ?? '',
      tags: parsed.data.tags ?? [],
    })
    return item ? c.json(item) : c.json({ error: 'not_found' }, 404)
  })

  app.patch('/api/t/:slug/investigations/:id/evidence/:eid', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = evidencePatchSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const ok = investigations.updateEvidence(
      config.slug,
      clientId(c),
      c.req.param('id'),
      c.req.param('eid'),
      parsed.data,
    )
    return ok ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
  })

  app.delete('/api/t/:slug/investigations/:id/evidence/:eid', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    investigations.removeEvidence(config.slug, clientId(c), c.req.param('id'), c.req.param('eid'))
    return c.json({ ok: true })
  })

  app.post('/api/t/:slug/investigations/:id/artefacts', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = artefactCreateSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    if (JSON.stringify(parsed.data).length > 512 * 1024) {
      return c.json({ error: 'artefact_too_large' }, 413)
    }
    const artefact = investigations.addArtefact(config.slug, clientId(c), c.req.param('id'), {
      kind: parsed.data.kind,
      title: parsed.data.title,
      data: parsed.data.data,
    })
    return artefact ? c.json(artefact) : c.json({ error: 'not_found' }, 404)
  })

  // Synthesis from an investigation's own evidence - no fresh retrieval, so
  // every statement traces to a passage the researcher chose to keep.
  app.post('/api/t/:slug/investigations/:id/synthesise', expensiveRateLimit, async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const investigation = investigations.get(config.slug, clientId(c), c.req.param('id'))
    if (!investigation) return c.json({ error: 'not_found' }, 404)
    if (investigation.evidence.length === 0) {
      return c.json({
        error: 'no_evidence',
        message: 'Save some evidence first - synthesis works only from kept passages.',
      }, 400)
    }
    // Evidence the researcher judged not relevant is left out; what is left
    // carries the researcher's verdict, tags and note so the synthesis works
    // from their judgement, not just the raw passage.
    const kept = investigation.evidence
      .filter((item) => item.verdict !== 'not-relevant')
      .slice(0, 40)
    if (kept.length === 0) {
      return c.json({
        error: 'no_evidence',
        message: 'Every saved passage is marked not relevant - judge or add evidence first.',
      }, 400)
    }
    const numbered = kept.map((item, index) => {
      const head = [
        `[${index + 1}]`,
        `verdict: ${item.verdict ?? 'unjudged'}`,
        item.tags.length > 0 ? `tags: ${item.tags.join(', ')}` : null,
        item.resourceTitle,
      ].filter(Boolean).join(' | ')
      const note = item.note.trim() ? `Researcher's note: ${item.note.trim().slice(0, 600)}\n` : ''
      return `${head}\n${note}${item.passage.slice(0, 1200)}`
    })
    const prompt = [
      `Research question: ${investigation.question || investigation.name}`,
      '',
      'Synthesise a brief STRICTLY from the numbered evidence passages below - never from ' +
      'outside knowledge. Cite passages inline as [n]. In `summary` give a clear, careful ' +
      'answer (or state that the evidence is insufficient). In `supported` list claims the ' +
      'evidence establishes, each with its [n] citations. In `contested` list points where ' +
      'passages disagree, naming both sides with citations. In `gaps` list what a researcher ' +
      'would still need to find out. Australian English.',
      '',
      "Each passage carries the researcher's verdict on it: `supports` means it supports an " +
      'answer to the question; `partial` means it bears on the question only in part; ' +
      "`contradicts` means the researcher judged it to contradict the question's premise or " +
      'the other evidence - report it as opposing evidence, never as support; `unjudged` ' +
      'means no verdict yet - use it with care and say so. A "Researcher\'s note" is the ' +
      "researcher's own reading of that passage and overrides the passage's surface " +
      'claim: if a note says the figures belong to a different intervention, study or ' +
      'population than the passage appears to describe, do not attribute them to the ' +
      "question's subject, and mention the caveat in `contested` or `gaps`.",
      '',
      ...numbered,
    ].join('\n')
    try {
      const result = await opts.management.askStructured(config, SYNTHESIS_SCHEMA, prompt)
      const raw = result.object as {
        summary?: string
        supported?: string[]
        contested?: string[]
        gaps?: string[]
      }
      // The synthesis never says "the context": the researcher sees passages.
      const voice = (v: string | undefined) => v === undefined ? undefined : rewriteSentinels(v)
      const list = (v: string[] | undefined) => v?.map((item) => rewriteSentinels(item))
      const brief = {
        ...raw,
        summary: voice(raw.summary),
        supported: list(raw.supported),
        contested: list(raw.contested),
        gaps: list(raw.gaps),
      }
      const references = kept.map((item, index) => ({
        n: index + 1,
        resourceId: item.resourceId,
        resourceTitle: item.resourceTitle,
      }))
      const artefact = investigations.addArtefact(config.slug, clientId(c), investigation.id, {
        kind: 'synthesis',
        title: `Synthesis - ${new Date().toISOString().slice(0, 10)}`,
        data: { ...brief, references },
      })
      return c.json({ ok: true, artefact })
    } catch {
      return c.json({
        error: 'synthesis_failed',
        message: 'The synthesis could not be generated - try again shortly.',
      }, 502)
    }
  })

  // Per-source relevance verdicts for an answer's sources - one structured
  // generation covering all passages, so triage is a single scan.
  app.post('/api/t/:slug/verdicts', expensiveRateLimit, async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const parsed = verdictsBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const { question, sources } = parsed.data
    const prompt = [
      `Research question: ${question}`,
      '',
      'For each source passage below, judge how it bears on the question.',
      "verdict: 'supports' (directly supports an answer), 'partial' (relevant background but not direct evidence), 'not-relevant', or 'contradicts'.",
      "Use 'contradicts' whenever a passage cuts against the premise of the question, disagrees " +
      'with another passage in this set, or contains conflicting findings within itself ' +
      '(for example: an effect observed in one study but absent in another). Genuine ' +
      'disagreement is the most valuable signal for a researcher - never smooth it into partial.',
      'relevance: one plain sentence saying what the passage does or does not establish for this question - name the specific finding, not a generality.',
      '',
      ...sources.map((s) => `Source id=${s.id} (${s.title}):\n${s.passage}`),
    ].join('\n')
    try {
      const result = await opts.management.askStructured(config, VERDICTS_SCHEMA, prompt)
      const raw = (result.object as { verdicts?: unknown }).verdicts
      const verdicts = Array.isArray(raw)
        ? raw.filter((v): v is { id: string; verdict: string; relevance: string } =>
          typeof v === 'object' && v !== null &&
          typeof (v as { id?: unknown }).id === 'string' &&
          typeof (v as { verdict?: unknown }).verdict === 'string' &&
          typeof (v as { relevance?: unknown }).relevance === 'string'
        )
        : []
      return c.json({ verdicts })
    } catch {
      return c.json({ verdicts: [] })
    }
  })

  // Questions worth asking NEXT, written from the answer just given and proved
  // against the passages that answer retrieved - see follow-up-questions.ts for
  // why the tenant's generic openers are the wrong thing under an answer.
  // Always 200 with a (possibly empty) list: the page renders nothing when
  // there is nothing good to offer, and a follow-up must never look like a
  // failure of the answer it follows.
  app.post('/api/t/:slug/followups', expensiveRateLimit, async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!opts.management) return c.json({ questions: [] })
    const parsed = followUpsBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    return c.json({
      questions: await generateFollowUpQuestions(opts.management, config, parsed.data),
    })
  })

  // Admin: connect a knowledge box to a tenant. The administrator enters the
  // KB id and service-account token in the app; both stay server-side. When
  // ADMIN_PASSCODE is configured every admin call must present it.
  app.use('/api/admin/*', async (c, next) => {
    if (opts.trustedAdmin?.(c.req.raw)) {
      await next()
      return
    }
    // Fail closed: with no passcode configured the admin surface is disabled,
    // never open. Local dev sets ADMIN_PASSCODE in .env.
    if (!opts.adminPasscode) {
      return c.json({
        error: 'admin_disabled',
        message: 'Administration is not configured on this server - set ADMIN_PASSCODE.',
      }, 503)
    }
    if (!(await secretsEqual(c.req.header('x-admin-passcode') ?? '', opts.adminPasscode))) {
      return c.json({ error: 'unauthorised' }, 401)
    }
    await next()
  })

  app.get('/api/admin/overview', async (c) => {
    const rows = await Promise.all(
      tenants.list(true).map(async (summary) => {
        const config = tenant(summary.slug)
        let resourceCount: number | null = null
        if (config) {
          try {
            resourceCount = (await provider.listResources(config)).length
          } catch {
            resourceCount = null
          }
        }
        return {
          tenant: summary,
          knowledgeBox: bindings.status(summary.slug),
          resourceCount,
          custom: tenants.isCustom(summary.slug),
          disabled: tenants.isDisabled(summary.slug),
        }
      }),
    )
    return c.json(rows)
  })

  app.delete('/api/admin/t/:slug/knowledge-box', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    bindings.remove(config.slug)
    opts.invalidate?.(config.slug)
    return c.json({ ok: true, status: bindings.status(config.slug) })
  })

  // Management routes need the live provider's management surface.
  const management = opts.management
  const requireManagement = (c: Context) =>
    management ? null : c.json({ error: 'management_unavailable' }, 503)

  app.post('/api/admin/tenants', async (c) => {
    const parsed = newTenantSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    try {
      const config = tenants.add(parsed.data as NewTenantInput)
      if (config.hostname) {
        return c.json({
          ok: true,
          slug: config.slug,
          domain: { status: 'active', hostname: config.hostname, created: false },
        })
      }

      const hostname = portalHostnameForSlug(config.slug)
      if (!hostname) {
        return c.json({
          ok: true,
          slug: config.slug,
          domain: { status: 'skipped', reason: 'unsafe_slug' },
        })
      }
      if (!domains) {
        return c.json({
          ok: true,
          slug: config.slug,
          domain: { status: 'skipped', hostname, reason: 'not_configured' },
        })
      }

      try {
        const attached = await domains.attach(hostname)
        try {
          tenants.patch(config.slug, { hostname: attached.hostname })
        } catch (error) {
          if (attached.created) await domains.detach(attached.hostname).catch(() => {})
          throw error
        }
        return c.json({
          ok: true,
          slug: config.slug,
          domain: { status: 'active', ...attached },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'domain provisioning failed'
        return c.json({
          ok: true,
          slug: config.slug,
          domain: { status: 'failed', hostname, message },
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'could not add the portal'
      return c.json({ error: 'invalid_request', message }, 400)
    }
  })

  app.delete('/api/admin/tenants/:slug', async (c) => {
    const slug = c.req.param('slug')
    if (!tenants.isCustom(slug)) return c.json({ error: 'not_removable' }, 400)
    const config = tenants.get(slug)
    if (config?.hostname) {
      if (!domains) {
        return c.json({
          error: 'domain_removal_unavailable',
          message: 'Domain removal is not configured. The portal has not been removed.',
        }, 503)
      }
      try {
        await domains.detach(config.hostname)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'domain removal failed'
        return c.json({ error: 'domain_removal_failed', message }, 502)
      }
    }
    tenants.remove(slug)
    bindings.remove(slug)
    opts.invalidate?.(slug)
    return c.json({
      ok: true,
      domain: config?.hostname
        ? { status: 'removed', hostname: config.hostname }
        : { status: 'not_configured' },
    })
  })

  app.post('/api/admin/t/:slug/knowledge-box/create', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    if (!accountOpsAvailable()) {
      return c.json({
        error: 'account_credentials_missing',
        message: 'Account credentials are not configured on this server.',
      }, 503)
    }
    const parsed = createKbBodySchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const zone = opts.zone ?? 'aws-ap-southeast-2-1'
    try {
      const kbSlug = `portal-${config.slug}-${Date.now().toString(36)}`
      const binding = await createKnowledgeBox(
        zone,
        kbSlug,
        parsed.data.title ?? `${config.branding.productName}`,
      )
      bindings.set(config.slug, binding)
      opts.invalidate?.(config.slug)
      return c.json({ ok: true, status: bindings.status(config.slug) })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'creation failed'
      return c.json({ error: 'creation_failed', message }, 502)
    }
  })

  app.get('/api/admin/t/:slug/counters', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    return c.json(await management!.counters(config))
  })

  app.get('/api/admin/t/:slug/recent', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    return c.json(await management!.recentResources(config))
  })

  app.post('/api/admin/t/:slug/resources/link', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const parsed = linkBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    // Same quality gate as scheduled syncs: fetch and clean the page so the
    // index holds body text, and bot walls never enter the corpus. Falls back
    // to the platform crawler when the site blocks server fetches.
    try {
      try {
        const res = await fetch(parsed.data.url, {
          headers: { 'user-agent': CRAWLER_USER_AGENT },
          signal: AbortSignal.timeout(25_000),
        })
        if (res.ok && (res.headers.get('content-type') ?? '').includes('html')) {
          const html = await res.text()
          const cleaned = extractMainContent(html)
          if (cleaned) {
            const created = await management!.createText(config, {
              title: parsed.data.title?.trim() || cleaned.title,
              body: cleaned.body,
              format: 'MARKDOWN',
              originUrl: parsed.data.url,
            })
            if (parsed.data.hidden) {
              await management!.setResourceHidden(config, created.id, true).catch(() => {})
            }
            return c.json(created)
          }
          if (looksLikeChallengePage(html)) {
            return c.json({
              error: 'challenge_page',
              message:
                'That page serves a bot wall to automated fetches - the content cannot be ingested cleanly. Try uploading the document itself.',
            }, 422)
          }
        }
      } catch (err) {
        // A knowledge-box back-pressure error is not a fetch/parse failure -
        // falling through to createLink below would just hit the same full
        // queue again. Let it escape to the outer catch instead.
        if (err instanceof AragApiError && err.backpressure) throw err
        // Any other failure (network, parsing) falls through to the platform crawler.
      }
      return c.json(await management!.createLink(config, parsed.data))
    } catch (err) {
      const handled = ingestErrorResponse(err)
      if (handled) return c.json(handled.body, handled.status)
      throw err
    }
  })

  app.post('/api/admin/t/:slug/resources/text', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const parsed = textBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    try {
      return c.json(await management!.createText(config, { ...parsed.data, format: 'MARKDOWN' }))
    } catch (err) {
      const handled = ingestErrorResponse(err)
      if (handled) return c.json(handled.body, handled.status)
      throw err
    }
  })

  app.post('/api/admin/t/:slug/resources/upload', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const filename = decodeURIComponent(c.req.header('x-filename') ?? 'upload')
    const contentType = c.req.header('content-type') ?? 'application/octet-stream'
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.length === 0) return c.json({ error: 'empty_file' }, 400)
    if (bytes.length > 100 * 1024 * 1024) return c.json({ error: 'file_too_large' }, 413)
    try {
      return c.json(await management!.uploadFile(config, { filename, contentType, bytes }))
    } catch (err) {
      const handled = ingestErrorResponse(err)
      if (handled) return c.json(handled.body, handled.status)
      throw err
    }
  })

  app.post('/api/admin/t/:slug/disable', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    tenants.setDisabled(config.slug, true)
    return c.json({ ok: true })
  })

  app.post('/api/admin/t/:slug/enable', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    tenants.setDisabled(config.slug, false)
    return c.json({ ok: true })
  })

  app.post('/api/admin/t/:slug/analyse', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableAn = requireManagement(c)
    if (unavailableAn) return unavailableAn
    return streamSSE(c, async (stream) => {
      try {
        for await (
          const event of analyseTenant(
            management!,
            tenants,
            config,
            (slug) => opts.invalidate?.(slug),
          )
        ) {
          await stream.writeSSE({ data: JSON.stringify(event) })
        }
      } catch (err) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            message: err instanceof Error ? err.message : 'analysis failed',
          }),
        })
      }
    })
  })

  app.patch('/api/admin/tenants/:slug', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = renameTenantSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    if (parsed.data.searchPlaceholder) {
      tenants.patch(config.slug, { searchPlaceholder: parsed.data.searchPlaceholder })
    }
    tenants.patchBranding(config.slug, {
      ...(parsed.data.colours ? { colours: parsed.data.colours } : {}),
      productName: parsed.data.name,
      organisation: parsed.data.organisation,
      tagline: parsed.data.tagline,
      typography: parsed.data.typography,
      shape: parsed.data.shape,
      textScale: parsed.data.textScale,
      density: parsed.data.density,
      paletteId: parsed.data.paletteId,
    })
    return c.json({ ok: true })
  })

  app.post('/api/admin/t/:slug/kg/propose', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableKg = requireManagement(c)
    if (unavailableKg) return unavailableKg
    try {
      const proposal = await proposeKgStrategy(management!, config)
      kgProposals.set(config.slug, proposal)
      return c.json(proposal)
    } catch (err) {
      return c.json({
        error: 'proposal_failed',
        message: err instanceof Error ? err.message : 'proposal failed',
      }, 502)
    }
  })

  app.post('/api/admin/t/:slug/kg/implement', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableKgI = requireManagement(c)
    if (unavailableKgI) return unavailableKgI
    const proposal = kgProposals.get(config.slug)
    if (!proposal) return c.json({ error: 'no_proposal', message: 'Run Propose first.' }, 400)
    const parsed = kgImplementSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    return streamSSE(c, async (stream) => {
      for await (
        const event of implementKgStrategy(management!, config, proposal, {
          applyExisting: parsed.data.applyExisting,
          includeSummaries: parsed.data.includeSummaries ?? false,
        })
      ) {
        await stream.writeSSE({ data: JSON.stringify(event) })
      }
    })
  })

  app.get('/api/admin/t/:slug/suggestions', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    return c.json(suggestions.list(config.slug))
  })

  app.post('/api/admin/t/:slug/interrogate', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    try {
      const list = await runInterrogation(management!, config, suggestions)
      return c.json(list)
    } catch (err) {
      console.error(err)
      return c.json({
        error: 'interrogation_failed',
        message: 'The interrogation could not complete - try again shortly.',
      }, 502)
    }
  })

  app.post('/api/admin/t/:slug/suggestions/:id/implement', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const suggestion = suggestions.list(config.slug).find((s) => s.id === c.req.param('id'))
    if (!suggestion) return c.json({ error: 'not_found' }, 404)
    if (suggestion.status !== 'pending') {
      return c.json({ error: 'already_decided' }, 409)
    }
    try {
      const summary = await implementSuggestion(management!, config, suggestion)
      suggestions.setStatus(config.slug, suggestion.id, 'implemented')
      return c.json({ ok: true, summary })
    } catch (err) {
      return c.json({
        error: 'implement_failed',
        message: err instanceof Error ? err.message : 'The suggestion could not be implemented.',
      }, 502)
    }
  })

  app.post('/api/admin/t/:slug/suggestions/:id/ignore', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const updated = suggestions.setStatus(config.slug, c.req.param('id'), 'ignored')
    return updated ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
  })

  app.get('/api/admin/t/:slug/kg/strategy', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const strategy = await management!.graphStrategy(config)
    return c.json({ strategy })
  })

  app.put('/api/admin/t/:slug/kg/strategy', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const parsed = graphStrategySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const input: GraphStrategyInput = parsed.data
    // Validate up front so the UI can show problems without streaming.
    const problems = validateGraphStrategy(input)
    if (problems.length > 0) return c.json({ error: 'invalid_strategy', problems }, 422)
    return streamSSE(c, async (stream) => {
      for await (const event of replaceGraphStrategy(management!, config, input)) {
        await stream.writeSSE({ data: JSON.stringify(event) })
      }
    })
  })

  app.get('/api/admin/t/:slug/agents', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableAg = requireManagement(c)
    if (unavailableAg) return unavailableAg
    try {
      return c.json(await management!.listAgents(config))
    } catch {
      return c.json([])
    }
  })

  app.delete('/api/admin/t/:slug/agents/:taskId', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableAd = requireManagement(c)
    if (unavailableAd) return unavailableAd
    await management!.deleteAgent(config, c.req.param('taskId'))
    return c.json({ ok: true })
  })

  // ------------------------------------------------------------------------
  // Enrichments (merchandising) - the schema-driven generator agents that
  // replace raw filenames with a real title/summary/takeaways/quotes. Phase 1
  // ships the default "research summary" agent; each appears here with its JSON
  // schema and run controls, gated by the admin passcode.
  // ------------------------------------------------------------------------

  const ENRICHMENT_GENERATION_NOTE =
    "Generated in-app with the platform's query-time structured answer " +
    "(answer_json_schema), grounded by embedding each resource's own extracted text " +
    'in the request rather than a second scoped retrieval, then cached. The ' +
    "platform's ingest-time JSON generator is not available on this knowledge box, " +
    'so this schema-driven path is used instead. The summary reuses the ' +
    "platform's existing per-resource page summary where one was already " +
    'generated; a resource whose structured generation fails still gets a ' +
    'partial entry from that page summary rather than being left unenriched.'

  app.get('/api/admin/t/:slug/enrichments/export', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    c.header('cache-control', 'no-store')
    c.header('content-disposition', `attachment; filename="${config.slug}-enrichments.json"`)
    return c.json(enrichments.exportRecords(config.slug))
  })

  app.post('/api/admin/t/:slug/enrichments/import', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)

    // Skip is the restore-safe default. Overwrite remains an explicit opt-in
    // through `?collision=overwrite`; no payload field can redirect the slug.
    const collisionValue = c.req.query('collision') ?? 'skip'
    if (collisionValue !== 'skip' && collisionValue !== 'overwrite') {
      return c.json({
        error: 'invalid_collision_policy',
        message: 'Use collision=skip or collision=overwrite.',
      }, 400)
    }
    const collision: EnrichmentCollisionPolicy = collisionValue

    const body = await readBoundedJson(c.req.raw, MAX_ENRICHMENT_IMPORT_BYTES)
    if (!body.ok) {
      return c.json(
        { error: body.error, message: body.message },
        body.error === 'payload_too_large' ? 413 : 400,
      )
    }
    const parsed = validateEnrichmentRecords(body.value)
    if (!parsed.success) {
      return c.json({
        error: 'invalid_enrichment_import',
        message: 'The enrichment import has an invalid shape.',
        issues: parsed.issues,
      }, 400)
    }

    const result = enrichments.importRecords(config.slug, parsed.data, collision)
    c.header('cache-control', 'no-store')
    return c.json({
      ok: true,
      targetSlug: config.slug,
      collisionPolicy: collision,
      ...result,
    })
  })

  app.get('/api/admin/t/:slug/enrichments', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableEn = requireManagement(c)
    if (unavailableEn) return unavailableEn
    let total = 0
    try {
      total = (await management!.listResources(config)).length
    } catch {
      total = 0
    }
    const rows: EnrichmentAgentStatus[] = ENRICHMENT_AGENTS.map((agent) => ({
      agent,
      jsonSchema: enrichmentJsonSchema(agent),
      enrichedCount: enrichments.count(config.slug, agent.id),
      totalCount: total,
      generationNote: ENRICHMENT_GENERATION_NOTE,
    }))
    return c.json(rows)
  })

  app.post('/api/admin/t/:slug/enrichments/run', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableRun = requireManagement(c)
    if (unavailableRun) return unavailableRun
    return streamSSE(c, async (stream) => {
      try {
        const body = await c.req.json().catch(() => ({})) as {
          scope?: string
          limit?: number
          agentId?: string
        }
        const scope = body.scope === 'all' ? 'all' : 'missing'
        const limit = typeof body.limit === 'number' && body.limit > 0
          ? Math.min(Math.floor(body.limit), 2000)
          : undefined
        const agent = ENRICHMENT_AGENTS.find((a) => a.id === body.agentId) ??
          DEFAULT_RESEARCH_ENRICHMENT
        for await (
          const event of runEnrichmentOverCorpus(management!, enrichments, config, {
            scope,
            limit,
            agent,
          })
        ) {
          await stream.writeSSE({ data: JSON.stringify(event) })
        }
      } catch (err) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            message: err instanceof Error ? err.message : 'Enrichment run failed',
          }),
        })
      }
    })
  })

  // Precompute per-document openers over the corpus (the same pass the
  // scheduler runs), so resource pages never generate them on demand.
  app.post('/api/admin/t/:slug/questions/run', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const body = await c.req.json().catch(() => ({})) as { limit?: number }
    const limit = typeof body.limit === 'number' && body.limit > 0
      ? Math.min(Math.floor(body.limit), 2000)
      : undefined
    return streamSSE(c, async (stream) => {
      try {
        for await (
          const event of runSuggestedQuestionsOverCorpus(management!, enrichments, config, {
            limit,
          })
        ) {
          await stream.writeSSE({ data: JSON.stringify(event) })
        }
      } catch (err) {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            message: err instanceof Error ? err.message : 'Question run failed',
          }),
        })
      }
    })
  })

  app.post('/api/admin/t/:slug/resources/:id/enrich', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableOne = requireManagement(c)
    if (unavailableOne) return unavailableOne
    const id = c.req.param('id')
    try {
      const agentId = new URL(c.req.url).searchParams.get('agentId')
      const agent = ENRICHMENT_AGENTS.find((a) => a.id === agentId) ?? DEFAULT_RESEARCH_ENRICHMENT
      const enrichment = await generateEnrichment(management!, config, id, agent)
      enrichments.put(config.slug, id, enrichment)
      const resource = await provider.resource(config, id)
      return c.json({
        ok: true,
        enrichment,
        resource: resource ? merchandiseSummary(enrichments, config.slug, resource) : null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'generation failed'
      return c.json({ error: 'enrichment_failed', message }, 502)
    }
  })

  app.post('/api/admin/t/:slug/branding/:kind', async (c) => {
    const config = tenant(c.req.param('slug'))
    const kind = c.req.param('kind')
    if (!config || !isBrandingKind(kind)) {
      return c.json({ error: 'invalid_request' }, 400)
    }
    const isFont = kind === 'font-heading' || kind === 'font-body'
    const contentType = c.req.header('content-type') ?? ''
    const ext = isFont
      ? (contentType === 'font/woff2'
        ? 'woff2'
        : contentType === 'font/woff'
        ? 'woff'
        : contentType === 'font/ttf'
        ? 'ttf'
        : contentType === 'font/otf'
        ? 'otf'
        : null)
      : (contentType === 'image/png'
        ? 'png'
        : contentType === 'image/jpeg'
        ? 'jpg'
        : contentType === 'image/webp'
        ? 'webp'
        : contentType === 'image/svg+xml'
        ? 'svg'
        : null)
    if (!ext) {
      const message = isFont ? 'Use WOFF2, WOFF, TTF or OTF.' : 'Use PNG, JPEG, WebP or SVG.'
      return c.json({ error: 'unsupported_type', message }, 415)
    }
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.length === 0) return c.json({ error: 'empty_file' }, 400)
    if (bytes.length > 5 * 1024 * 1024) return c.json({ error: 'file_too_large' }, 413)
    if (opts.branding) {
      opts.branding.put(config.slug, kind, {
        bytes,
        contentType,
        version: String(Date.now()),
      })
      return c.json({ ok: true, url: `/api/t/${config.slug}/branding/${kind}` })
    }
    mkdirSync(brandingDir, { recursive: true })
    // Drop any previous file for this slot so only one extension exists.
    for (const old of brandingExts(kind)) {
      const p = `${brandingDir}/${config.slug}-${kind}.${old}`
      if (existsSync(p)) {
        try {
          Deno.removeSync(p)
        } catch {
          // ignore
        }
      }
    }
    writeFileSync(`${brandingDir}/${config.slug}-${kind}.${ext}`, bytes)
    return c.json({ ok: true, url: `/api/t/${config.slug}/branding/${kind}` })
  })

  app.get('/api/admin/t/:slug/prompts', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    return c.json(tenants.promptsFor(config.slug))
  })

  app.put('/api/admin/t/:slug/prompts', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = promptsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    tenants.patch(config.slug, { prompts: { ask: parsed.data.ask?.trim() || undefined } })
    return c.json({ ok: true })
  })

  app.get('/api/admin/t/:slug/search-configs', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableSc = requireManagement(c)
    if (unavailableSc) return unavailableSc
    return c.json(await management!.listSearchConfigs(config))
  })

  app.post('/api/admin/t/:slug/search-configs/ensure', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableSe = requireManagement(c)
    if (unavailableSe) return unavailableSe
    const created = await management!.ensureSearchConfigs(config)
    return c.json({ ok: true, created })
  })

  // Ingest (or update) the in-app documentation into the box as resources
  // labelled `documentation`. A clean, idempotent admin action the orchestrator
  // runs once the box is free (it is back-pressured during a corpus reload).
  // Ensures the label-isolated search configs exist first, so the Help search
  // and the research exclusion are both wired the moment the docs land. On a
  // busy box the ingestion returns 503 (ingestion_busy) rather than a bare 500.
  app.post('/api/admin/t/:slug/docs/ingest', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableDi = requireManagement(c)
    if (unavailableDi) return unavailableDi
    try {
      const configs = await management!.ensureSearchConfigs(config).catch(() => [] as string[])
      const result = await management!.ingestDocumentation(config)
      // Refresh the readiness signal so /api/health reflects the ingestion
      // (best effort: a freshly ingested page can take a minute to index).
      void opts.docsHealth?.checkTenant(config).catch(() => {})
      return c.json({ ok: true, searchConfigs: configs, ...result })
    } catch (err) {
      const handled = ingestErrorResponse(err)
      if (handled) return c.json(handled.body, handled.status)
      throw err
    }
  })

  app.get('/api/admin/t/:slug/crawl', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const url = c.req.query('url')
    if (!url) return c.json({ error: 'missing_url' }, 400)
    const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200)
    try {
      return c.json(await discoverLinks(url, limit))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'discovery failed'
      return c.json({ error: 'crawl_failed', message }, 400)
    }
  })

  app.post('/api/admin/t/:slug/labelsets', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailableLs = requireManagement(c)
    if (unavailableLs) return unavailableLs
    const parsed = labelsetBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const id = parsed.data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!id) return c.json({ error: 'invalid_request' }, 400)
    await management!.createLabelset(config, { id, ...parsed.data })
    return c.json({ ok: true, id })
  })

  // Replace a crawled link resource with clean main-content text. The HTML
  // comes from the caller (an admin's browser can render pages the server
  // cannot fetch); labels, title and origin carry over.
  app.post('/api/admin/t/:slug/reingest', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const body = await c.req.json().catch(() => null) as
      | { resourceId?: string; html?: string }
      | null
    if (!body?.resourceId || !body.html || body.html.length > 4 * 1024 * 1024) {
      return c.json({ error: 'invalid_request' }, 400)
    }
    const [summary, full] = await Promise.all([
      provider.resource(config, body.resourceId).catch(() => null),
      management!.resourceFull(config, body.resourceId).catch(() => null),
    ])
    if (!summary || !full) return c.json({ error: 'not_found' }, 404)
    const cleaned = extractMainContent(body.html)
    if (!cleaned) {
      return c.json({
        error: 'no_content',
        message: 'No meaningful body content survived extraction - resource left unchanged.',
      }, 422)
    }
    const created = await management!.createText(config, {
      title: summary.title,
      body: cleaned.body,
      format: 'MARKDOWN',
      originUrl: full.originUrl,
    })
    // Carry the labels across, then retire the chrome-laden original.
    const classifications = [
      ...summary.topicIds.slice(0, 1).map((topic) => ({ labelset: 'topic', label: topic })),
      ...(summary.kind ? [{ labelset: 'kind', label: summary.kind }] : []),
    ]
    if (classifications.length > 0) {
      await management!.patchResourceClassifications(config, created.id, classifications)
        .catch(() => {})
    }
    await management!.deleteResource(config, body.resourceId)
    return c.json({ ok: true, newId: created.id, words: cleaned.body.split(/\s+/).length })
  })

  app.get('/api/admin/t/:slug/corpus-health', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    return c.json(await management!.corpusHealth(config))
  })

  // Permanently removes failed-crawl junk (bot-challenge pages, blank-titled
  // error resources) - see AragProvider.purgeFailedResources/isPurgeEligible
  // for the exact, deliberately conservative eligibility rule. Defaults to a
  // dry run: the caller must send an explicit { dryRun: false } to delete
  // anything. Streamed over SSE (like kg/implement) since a full-catalogue
  // purge on a large box can run long enough to risk a plain-JSON timeout.
  app.post('/api/admin/t/:slug/purge-failed', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const parsed = purgeFailedBodySchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    // Absent, or anything other than exactly `false`, stays a dry run.
    const dryRun = parsed.data.dryRun !== false
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({ data: JSON.stringify({ type: 'started', dryRun }) })
      try {
        const result = await management!.purgeFailedResources(config, { dryRun })
        await stream.writeSSE({ data: JSON.stringify({ type: 'done', dryRun, ...result }) })
      } catch (err) {
        console.error(err)
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            message: err instanceof Error ? err.message : 'The purge could not complete.',
          }),
        })
      }
    })
  })

  app.get('/api/admin/t/:slug/insights', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    return c.json(insights.summary(config.slug))
  })

  app.post('/api/admin/t/:slug/resources/:id/hidden', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const parsed = hiddenBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    try {
      await management!.setResourceHidden(config, c.req.param('id'), parsed.data.hidden)
    } catch (err) {
      // Boxes ship with the hidden-resources feature off - enable and retry.
      const message = err instanceof Error ? err.message : ''
      const kbId = bindings.get(config.slug)?.baseUrl.split('/kb/')[1]
      if (!/hidden resources enabled/i.test(message) || !kbId) throw err
      await enableHiddenResources(opts.zone ?? 'aws-ap-southeast-2-1', kbId)
      await management!.setResourceHidden(config, c.req.param('id'), parsed.data.hidden)
    }
    return c.json({ ok: true })
  })

  // --- Website sources: register once, sync on demand and daily -------------
  // A "source" is a website or sitemap URL, not a single page. Each sync
  // re-discovers the site, diffs against the urls already ingested from it,
  // and ingests what is new (bounded by the source's own page cap).

  app.get('/api/admin/t/:slug/sources', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    // `summaries`, not `list`: the stored `synced` url ledger runs to
    // thousands of entries and the browser only needs its count.
    return c.json(sources.summaries(config.slug))
  })

  app.post('/api/admin/t/:slug/sources', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = sourceBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const { url, auto, maxPages } = parsed.data
    const duplicate = sources.findByUrl(config.slug, url)
    // Silently handing back the existing row made the UI report "Source
    // added" for a source that was already registered.
    if (duplicate) {
      return c.json({
        error: 'duplicate_source',
        message: 'That URL is already registered as a source.',
        source: sources.summaries(config.slug).find((s) => s.id === duplicate.id),
      }, 409)
    }
    // Prove the site is actually crawlable BEFORE registering it. Without
    // this, an unreachable or bot-walled site (frdc.com.au is one) registers
    // happily and only reveals the problem when someone presses Sync now -
    // or never, if it is left to the daily schedule.
    let discovered: { source: string; count: number }
    try {
      discovered = await discoverLinks(url, 25)
    } catch (err) {
      return c.json({
        error: 'source_unreachable',
        message: err instanceof Error ? err.message : 'That site could not be read.',
      }, 400)
    }
    if (discovered.count === 0) {
      return c.json({
        error: 'no_pages_found',
        message: 'No pages were found at that address. Point at a site section or a sitemap ' +
          '(for example https://example.com/sitemap.xml).',
      }, 400)
    }
    const added = sources.add(config.slug, url, auto ?? true, maxPages)
    const summary = sources.summaries(config.slug).find((s) => s.id === added.id)
    return c.json({
      ...summary,
      discovered: discovered.count,
      discoveredVia: discovered.source,
    })
  })

  // Change how a registered source behaves: daily auto-sync on or off, and
  // how many new pages one run may ingest.
  app.patch('/api/admin/t/:slug/sources/:id', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = sourcePatchSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const id = c.req.param('id')
    if (!sources.find(config.slug, id)) return c.json({ error: 'not_found' }, 404)
    sources.update(config.slug, id, parsed.data)
    const updated = sources.summaries(config.slug).find((s) => s.id === id)
    return c.json(updated ?? { error: 'not_found' })
  })

  app.delete('/api/admin/t/:slug/sources/:id', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    sources.remove(config.slug, c.req.param('id'))
    return c.json({ ok: true })
  })

  app.post('/api/admin/t/:slug/sources/:id/sync', (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const source = sources.find(config.slug, c.req.param('id'))
    if (!source) return c.json({ error: 'not_found' }, 404)
    if (!opts.management) return c.json({ error: 'management_unavailable' }, 503)
    const management = opts.management
    return streamSSE(c, async (stream) => {
      const emit = (event: unknown) => stream.writeSSE({ data: JSON.stringify(event) })
      try {
        const { added, deferred } = await syncSource(
          management,
          sources,
          config,
          source,
          (label) => emit({ type: 'item', label }),
        )
        await emit({ type: 'done', added, deferred })
      } catch (err) {
        // Persist the failure against the source as well as streaming it, so
        // it is still visible after the log panel is closed - and identical
        // to what a failed scheduled run leaves behind.
        const message = recordSyncFailure(sources, config.slug, source, err)
        await emit({ type: 'error', message })
      }
    })
  })

  app.post('/api/admin/migrate', async (c) => {
    const unavailable = requireManagement(c)
    if (unavailable) return unavailable
    const parsed = migrateBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400)
    const from = tenant(parsed.data.from)
    const to = tenant(parsed.data.to)
    if (!from || !to || from.slug === to.slug) return c.json({ error: 'invalid_tenants' }, 400)
    return streamSSE(c, async (stream) => {
      const send = (event: MigrationEvent) => stream.writeSSE({ data: JSON.stringify(event) })
      try {
        const sources = await management!.listResources(from)
        await send({ type: 'start', total: sources.length })
        let copied = 0
        let skipped = 0
        let errors = 0
        for (const source of sources) {
          try {
            const full = await management!.resourceFull(from, source.id)
            const slug = full.slug ?? `mig-${source.id}`
            if (await management!.hasSlug(to, slug)) {
              skipped += 1
              await send({
                type: 'item',
                id: source.id,
                title: full.title,
                outcome: 'skipped-exists',
              })
              continue
            }
            if (full.kind === 'link' && full.originUrl) {
              await management!.createLink(to, { url: full.originUrl, title: full.title })
            } else if (full.texts.length > 0) {
              await management!.createText(to, {
                title: full.title,
                body: full.texts.map((t) => t.body).join('\n\n'),
                format: 'MARKDOWN',
                slug,
                topicId: full.topicIds[0],
                extraMetadata: full.extraMetadata,
              })
            } else {
              skipped += 1
              await send({
                type: 'item',
                id: source.id,
                title: full.title,
                outcome: 'skipped-unsupported',
                detail: 'Binary file without extracted text - re-upload it directly.',
              })
              continue
            }
            copied += 1
            await send({ type: 'item', id: source.id, title: full.title, outcome: 'copied' })
          } catch (err) {
            errors += 1
            await send({
              type: 'item',
              id: source.id,
              title: source.title,
              outcome: 'error',
              detail: err instanceof Error ? err.message.slice(0, 200) : 'failed',
            })
          }
        }
        await send({ type: 'done', copied, skipped, errors })
      } catch (err) {
        await send({
          type: 'error',
          message: err instanceof Error ? err.message : 'migration failed',
        })
      }
    })
  })

  app.post('/api/admin/t/:slug/knowledge-box', async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const raw = await c.req.json().catch(() => null) as
      | { url?: unknown; token?: unknown }
      | null
    const parsed = connectBodySchema.safeParse(
      raw && typeof raw.url === 'string' && typeof raw.token === 'string'
        ? { url: raw.url.trim(), token: cleanToken(raw.token) }
        : raw,
    )
    if (!parsed.success) return c.json({ error: 'invalid_binding' }, 400)
    const target = parseKbUrl(parsed.data.url)
    if (!target) {
      return c.json({
        error: 'invalid_url',
        message: 'Enter the full knowledge box API endpoint - it should look like ' +
          'https://<region>.rag.progress.cloud/api/v1/kb/<box-id>.',
      }, 400)
    }
    const candidate = { baseUrl: target.baseUrl, token: parsed.data.token, kbId: target.kbId }
    const probe = new KbClient(candidate)
    let resourceCount = 0
    try {
      const counters = await probe.getJson<{ resources?: number }>('/counters')
      resourceCount = counters.resources ?? 0
    } catch (err) {
      const status = err instanceof AragApiError ? err.status : 0
      const text = err instanceof Error ? err.message : ''
      const message = status === 401 || status === 403 ||
          /jwt|decod|signature|unauthor|forbidden/i.test(text)
        ? 'The API key was not accepted - check it is the full service-account key ' +
          '(no Bearer prefix or quotes) and that it belongs to this box.'
        : status === 404
        ? 'The box was not found - check the URL ends with /api/v1/kb/<box-id> and the ' +
          'region is right.'
        : `Could not reach this knowledge box (${status || 'network error'}).`
      return c.json({ error: 'verification_failed', message }, 400)
    }
    bindings.set(config.slug, candidate)
    opts.invalidate?.(config.slug)
    return c.json({ ok: true, status: bindings.status(config.slug), resourceCount })
  })

  app.post('/api/t/:slug/ask', expensiveRateLimit, async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = askBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_query' }, 400)
    const intents = config.intents ?? []
    let intentDef = parsed.data.intent
      ? intents.find((i) => i.id === parsed.data.intent)
      : undefined
    if (parsed.data.intent && !intentDef) return c.json({ error: 'unknown_intent' }, 400)
    // The finished response declares UTF-8 (the streaming helper sets its own
    // content type); a Latin-1-assuming API client otherwise sees mojibake.
    return withUtf8EventStream(streamSSE(c, async (stream) => {
      const { query, route: routeMode, ...askOpts } = parsed.data
      const settings = tenants.promptsFor(config.slug)
      const lexicon = config.entityTerms ?? []
      const documentScope = Boolean(askOpts.resourceId)
      const firstTurn = !askOpts.context?.length
      const send = (event: unknown) => stream.writeSSE({ data: JSON.stringify(event) })
      // Automatic routing (docs/INTENT-ROUTING.md). The rule stage is
      // synchronous and answers at once; when no rule fires the classifier
      // runs in parallel with the retrieval probe and the decomposition
      // below rather than ahead of them, so a classified question costs
      // the slowest of the three, not their sum. The decision is reported
      // as a `route` event before any delta.
      const ctx = routeContext(config, 'ask')
      const autoRoute = routeMode === 'auto' && !askOpts.intent && !documentScope && firstTurn &&
        intents.length > 0
      let classifierPending: Promise<RouteDecision> | null = null
      if (autoRoute) {
        const started = Date.now()
        const byRule = routeByRules(query, ctx)
        if (byRule) {
          intentDef = intents.find((i) => i.id === byRule.intent)
          askOpts.intent = byRule.intent
          recordRoute(config, query, byRule, Date.now() - started)
          await send({ type: 'route', decision: byRule })
        } else {
          classifierPending = classify(config, query, ctx, extractEntities(query, lexicon))
            .then((decision) => {
              recordRoute(config, query, decision, Date.now() - started)
              return decision
            })
        }
      }
      // The study-name guard: a paper the question names ("the BREATHS
      // trial", "UMPIRE", a quoted title) is pinned into the grounding set
      // and leads the sources, whatever retrieval ranks first.
      const pinned = !documentScope && firstTurn
        ? matchStudies(query, await provider.listResources(config).catch(() => []))
        : []
      const pinnedIds = pinned.map((p) => p.id)
      const pinnedFirst = (resources: ScoredResource[]): ScoredResource[] =>
        pinnedIds.length === 0
          ? resources
          : [...resources].sort((a, b) =>
            Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id))
          )
      // Evidence-seeking questions get decomposed by default: broad questions
      // otherwise miss decisive passages that narrower phrasings retrieve.
      // Skipped for follow-up turns, when the caller already decomposed, and
      // for a results question (one figure from one paper is narrow already,
      // and the decomposition would cost more than the answer). Started
      // now, awaited only once the intent's own sub-questions are known.
      const evidenceSeeking =
        /\b(evidence|safe|safety|risk|risks|effect|effects|impact|impacts|compare|comparison|versus|\bvs\b|harm|cause|caused)\b/i
          .test(query)
      const decompositionPending =
        evidenceSeeking && !isResultsQuestion(query) && !askOpts.prequeries?.length && firstTurn &&
          opts.management
          ? Promise.race([
            opts.management.askStructured(
              config,
              SUBQUERIES_SCHEMA,
              `Break this research question into 3 to 5 focused sub-questions that together cover it fully. Sub-questions must be answerable from the corpus and phrased as standalone questions: ${query}`,
            ),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 16000)),
          ]).catch(() => null)
          : null
      // Grounding gate BEFORE generation. The platform's stream reports its
      // retrieval after the answer tokens, so a floor applied to that event
      // can only append a decline under an answer that already streamed. A
      // find on the routed configuration costs well under a second and lets
      // the portal decline (or change configuration) before a word is
      // generated. Two outcomes: an intent whose configuration is restricted
      // to supplements and finds nothing strong falls back to the general
      // configuration (a "what rate" question misrouted to data sheets is
      // otherwise answered from the wrong table); a weak best match on the
      // final configuration is declined outright with the closest matches
      // shown as sources, never answered over. The probe starts under the
      // intent known so far and runs while the classifier thinks; a pinned
      // paper gets its own targeted find beside it.
      const GROUNDING_FLOOR = 0.3
      /** A best match this strong with a refusal is the generator, not the corpus, saying no. */
      const STRONG_MATCH = 0.9
      /** Closest matches previewed before generation, and named in a decline. */
      const NEAREST_SHOWN = 8
      const probe = async (intent: string | undefined) => {
        const found = await provider.search(config, query, { intent, pageSize: 8 })
        const best = found.resources.reduce((m, r) => Math.max(m, r.relevance), 0)
        return { resources: found.resources, best }
      }
      const probedIntent = askOpts.intent
      const probePending = !documentScope && firstTurn ? probe(probedIntent) : null
      const pinnedPending = pinnedIds.length > 0
        ? provider.search(config, query, { resourceIds: pinnedIds, pageSize: 8 }).then(
          (found) => found.resources,
          () => [] as ScoredResource[],
        )
        : null
      if (classifierPending) {
        const decision = await classifierPending
        intentDef = intents.find((i) => i.id === decision.intent)
        askOpts.intent = decision.intent
        await send({ type: 'route', decision })
      }
      const variant = intentDef?.answer.promptVariant
      // An intent's mandatory sub-questions (a safety check for a treatment
      // decision, a recency probe) join whatever the caller sent - but only
      // the ones that fit: a drug-safety probe fires for medication entities
      // on a treatment question, never for an antigen, a journal or a
      // retention question (ask-prequeries.ts).
      if (intentDef && intentDef.answer.prequeries.length > 0) {
        const entities = extractEntities(query, lexicon)
        const mandatory = applicablePrequeries(intentDef.answer.prequeries, query, entities)
        const combined = [...mandatory, ...(askOpts.prequeries ?? [])].slice(0, 8)
        if (combined.length > 0) {
          askOpts.prequeries = combined
          await send({ type: 'searched', queries: combined })
        }
      }
      if (decompositionPending && !askOpts.prequeries?.length) {
        const decomposition = await decompositionPending
        const questions = decomposition
          ? ((decomposition.object as { questions?: unknown }).questions ?? []) as string[]
          : []
        const cleaned = questions
          .filter((q) => typeof q === 'string' && q.trim().length > 3)
          .slice(0, 5)
        if (cleaned.length > 0) {
          askOpts.prequeries = cleaned
          await send({ type: 'searched', queries: cleaned })
        }
      }
      // A question that names an author the catalogue knows is a question
      // about that author's papers: retrieval is scoped to them, and the
      // audit later forbids "X and colleagues" over a paper X did not write
      // (ask-author.ts). The catalogue read is cached by the provider.
      const catalogue = documentScope ? [] : await provider.listResources(config).catch(() => [])
      const namedAuthors = documentScope ? [] : authorsNamed(query, catalogue, lexicon)
      const authorScope = [...new Set(namedAuthors.flatMap((a) => a.resourceIds))]
      const resourceIds = authorScope.length > 0 && authorScope.length <= 80
        ? authorScope
        : undefined
      let intentForAsk = askOpts.intent
      let preflightRan = false
      // The closest resources the pre-flight found: named in a decline, and
      // the source of publication years for a recency question.
      let nearest: ScoredResource[] = []
      const supplementsOnly = intentDef?.retrieval.only.some((l) =>
        l.labelset === 'format' && l.label === 'supplement'
      ) ?? false
      const fallbackEvent = (reason: string) =>
        send({ type: 'fallback', from: intentDef?.id, to: null, reason })
      const recordDecline = () => {
        try {
          insights.record(config.slug, {
            ts: new Date().toISOString(),
            question: query.slice(0, 500),
            answered: false,
            citations: 0,
            durationSec: null,
            answerRelevance: null,
            groundedness: null,
            contextRelevance: null,
          })
        } catch {
          // insights are best-effort
        }
      }
      if (probePending) {
        try {
          let found = await probePending
          // The classifier chose a supplements-only configuration after the
          // probe ran on the default: probe that configuration now so its
          // fallback below is judged on its own retrieval.
          if (intentForAsk !== probedIntent && supplementsOnly) {
            found = await probe(intentForAsk)
          }
          preflightRan = true
          if (
            intentDef && supplementsOnly &&
            (found.resources.length === 0 || found.best < GROUNDING_FLOOR)
          ) {
            intentForAsk = undefined
            await fallbackEvent(
              found.resources.length === 0
                ? 'The supplementary data configuration found nothing for this question.'
                : `The supplementary data configuration found only weak matches (best ${
                  Math.round(found.best * 100)
                }%).`,
            )
            found = await probe(undefined)
          }
          const pinnedFound = pinnedPending ? await pinnedPending : []
          const pinnedBest = pinnedFound.reduce((m, r) =>
            Math.max(m, r.relevance), 0)
          const seen = new Set(pinnedFound.map((r) => r.id))
          // The pinned papers, then the probe's closest matches: a preview
          // of the grounding set, capped so it reads as a shortlist.
          nearest = merchandiseSources(
            enrichments,
            config.slug,
            withoutReferencePassages([
              ...pinnedFound,
              ...found.resources.filter((r) => !seen.has(r.id)),
            ]),
          ).slice(0, NEAREST_SHOWN)
          const best = Math.max(found.best, pinnedBest)
          if (nearest.length > 0 && best < GROUNDING_FLOOR) {
            await send({ type: 'sources', resources: nearest })
            const decline = corpusDecline(nearestTitles(nearest), best * 100)
            await send({ type: 'delta', text: decline })
            await send({ type: 'done', refused: true, text: decline })
            recordDecline()
            return
          }
          // What retrieval found, shown before generation starts: the
          // platform reports its own grounding set only after the answer
          // tokens, and a reader watching an empty panel for ten seconds
          // cannot tell progress from a hang. The grounded set replaces it.
          if (nearest.length > 0) await send({ type: 'sources', resources: nearest })
        } catch {
          // The gate is best-effort: a failed probe streams the plain ask,
          // which keeps the in-stream floor below as its fallback.
        }
      }
      // Context the application adds beside retrieval. Document chat gets
      // the document's tables and key-resources block (retrieval alone
      // misses a strain or a parameter that lives only in a table) and a
      // prompt that keeps a statistic's name and enumerates on "which"; a
      // recency question gets the publication years of the matching
      // resources so no year is guessed.
      let extraContext: string[] | undefined
      let promptAddendum: string | undefined
      if (documentScope) {
        promptAddendum = DOCUMENT_CHAT_ADDENDUM
        if (opts.management) {
          try {
            const text = await extractionText(opts.management, config, askOpts.resourceId!)
            const blocks = documentContextBlocks(text)
            if (blocks.length > 0) extraContext = blocks
          } catch {
            // The document's own retrieval still grounds the answer.
          }
        }
      } else if (variant === 'recency' && nearest.length > 0) {
        extraContext = [publicationYearsContext(nearest)]
      }
      // How the platform interpreted the question, surfaced when it lands in
      // time (first turn only - follow-ups depend on chat context).
      let interpreted: string | null | undefined
      if (!askOpts.context?.length && opts.management) {
        opts.management.rephrase(config, query).then((v) => interpreted = v, () => {})
      }
      let interpretedSent = false
      // The stream is reshaped on the way through (docs/EPREPO-ROADMAP.md
      // R1 to R5, R8, R10, R19): text forwards through the reference-list
      // stop and the sentinel rewriter; citations are held until the text
      // is complete and re-bound sentence by sentence against the cited
      // texts; the finished text is audited (figures beside their terms,
      // years, contraindications) before `done`; a refusal becomes the
      // portal's own decline with the closest matches shown, not used.
      let answerText = ''
      let forwardedLength = 0
      let sentinels = new SentinelStream()
      let heldCitations: Citation[] = []
      let heldDecline = false
      let lastSources: ScoredResource[] = []
      let bestRelevance = 0
      let finished = false
      const record = {
        citations: 0,
        durationSec: null as number | null,
        answerRelevance: null as number | null,
        groundedness: null as number | null,
        contextRelevance: null as number | null,
        failed: false,
        refused: false,
      }
      const finishRefused = async () => {
        finished = true
        record.refused = true
        const text = documentScope ? documentDecline() : corpusDecline(nearestTitles(lastSources))
        // A refusal always shows what retrieval found, labelled by the
        // surface as the closest matches, not used - never an empty panel
        // beside "no answer".
        if (lastSources.length > 0) await send({ type: 'sources', resources: lastSources })
        await send({ type: 'delta', text })
        await send({ type: 'done', refused: true, text })
      }
      const finishAnswered = async (doneText: string | undefined) => {
        finished = true
        const tail = sentinels.flush()
        if (tail) await send({ type: 'delta', text: tail })
        // The model's own reference lines go (a "References" block, an
        // author-year entry, a cited title written out), then the sentinel
        // phrases, then a generation that stopped mid-sentence is cut back
        // to its last complete sentence and the surface told (D1-04).
        const stripped = rewriteSentinels(
          stripModelReferences(doneText ?? answerText, heldCitations.map((c) => c.title)),
        )
        const trimmed = trimTruncatedTail(stripped)
        let text = trimmed.text
        const truncated = trimmed.truncated
        if (!text) {
          await finishRefused()
          return
        }
        // A citation's chip carries the bibliographic title; a resource the
        // grounding cited without retrieving (graph walks do this) is looked
        // up so its curated title is used rather than a generated headline.
        const byId = new Map<
          string,
          { title: string; titleCurated?: boolean; sourceName?: string; enriched?: boolean }
        >(
          lastSources.map((s) => [s.id, s]),
        )
        await Promise.all(
          [...new Set(heldCitations.map((c) => c.resourceId))]
            .filter((id) => !byId.has(id))
            .map(async (id) => {
              try {
                const resource = await provider.resource(config, id)
                if (resource) byId.set(id, resource)
              } catch {
                // The citation keeps the title the provider resolved.
              }
            }),
        )
        let citations = heldCitations.map((citation) =>
          merchandiseCitation(enrichments, config.slug, citation, byId.get(citation.resourceId))
        )
        let audit: AuditEvent | null = null
        let passagesRechosen = false
        if (!documentScope && citations.length > 0 && opts.management) {
          try {
            const bound = await bindAndAudit({
              management: opts.management,
              config,
              query,
              text,
              citations,
              sources: lastSources,
              lexicon,
              variant,
              floor: GROUNDING_FLOOR,
              catalogue,
              authors: namedAuthors,
            })
            text = bound.text
            citations = bound.citations
            audit = bound.audit
            // Cited resources now quote the paragraph that carries the claim.
            lastSources = bound.sources
            passagesRechosen = true
          } catch {
            // The audit is best-effort; the answer stands with the
            // platform's own binding.
          }
        }
        // An answer that states figures with no citation left to carry
        // them is not an answer: the binding stripped every marker because
        // no cited passage held the claims, and bare prose with numbers in
        // it would read as fact. The honest decline stands in its place,
        // with the closest matches shown, not used.
        if (!documentScope && citations.length === 0 && /\d/.test(text)) {
          await finishRefused()
          return
        }
        // Evidence cards never show a bibliography paragraph as a passage,
        // and an uncited reference-list hit is not evidence at all.
        const citedIds = new Set(citations.map((c) => c.resourceId))
        const shown = lastSources.filter((s) => !s.referenceChunk || citedIds.has(s.id))
        if (shown.length !== lastSources.length || passagesRechosen) {
          await send({ type: 'sources', resources: shown })
        }
        for (const citation of citations) await send({ type: 'citation', citation })
        if (audit) await send(audit)
        record.citations = citations.length
        await send({ type: 'done', refused: false, text, ...(truncated ? { truncated } : {}) })
      }
      // One attempt normally. A second when a supplements-only intent's own
      // generation refuses outright (the data sheets matched on words but
      // held no answer) - on the general configuration - or when the
      // generator refuses despite a strong best match on a routed intent or
      // with safety prequeries in play: the probes and the narrower
      // configuration crowded the grounding set, so the question is asked
      // once more on the default configuration without them. Nothing has
      // streamed by then, so the surface sees one answer.
      const attempts: { intent: string | undefined; prequeries: string[] | undefined }[] = [{
        intent: intentForAsk,
        prequeries: askOpts.prequeries,
      }]
      let retry: 'supplements' | 'prequeries' | null = null
      let retriedWithoutPrequeries = false
      for (let attempt = 0; attempt < attempts.length; attempt++) {
        const current = attempts[attempt]!
        answerText = ''
        forwardedLength = 0
        sentinels = new SentinelStream()
        heldCitations = []
        heldDecline = false
        record.citations = 0
        try {
          for await (
            const event of provider.ask(config, query, {
              ...askOpts,
              ...(resourceIds ? { resourceIds } : {}),
              intent: current.intent,
              prequeries: current.prequeries,
              ...(pinnedIds.length > 0 ? { pinnedResourceIds: pinnedIds } : {}),
              ...(settings.ask ? { systemPrompt: settings.ask } : {}),
              ...(settings.images ? { images: true } : {}),
              ...(extraContext ? { extraContext } : {}),
              ...(promptAddendum ? { promptAddendum } : {}),
            })
          ) {
            if (event.type === 'citation') {
              heldCitations.push(event.citation)
              continue
            }
            if (event.type === 'delta') {
              // The provider's fixed decline copy is held: the handler
              // composes its own decline once `done` confirms the refusal.
              if (!answerText.trim() && looksLikeProviderDecline(event.text)) {
                heldDecline = true
                continue
              }
              answerText += event.text
              // A model-authored "References:" list is never forwarded: the
              // evidence panel is the reference list, and the model's own
              // numbering never matches the bound citations.
              const slice = forwardableSlice(forwardedLength, answerText)
              if (slice.text.length > 0) {
                forwardedLength += slice.text.length
                const out = sentinels.push(slice.text)
                if (out) await send({ type: 'delta', text: out })
              }
              continue
            }
            if (event.type === 'sources') {
              // The provider clears its sources on a refusal; the refusal
              // path here re-sends the closest matches instead.
              if (event.resources.length === 0) continue
              const shaped = pinnedFirst(merchandiseSources(
                enrichments,
                config.slug,
                withoutReferencePassages(event.resources),
              ))
              lastSources = shaped
              bestRelevance = shaped.reduce((m, r) => Math.max(m, r.relevance), 0)
              if (!documentScope && !preflightRan && bestRelevance < GROUNDING_FLOOR) {
                // An empty retrieval is the provider's own refusal path; the
                // guard covers the other failure, weak matches that would be
                // answered over.
                await send({ type: 'sources', resources: shaped })
                const decline = corpusDecline(nearestTitles(shaped), bestRelevance * 100)
                await send({ type: 'delta', text: decline })
                await send({ type: 'done', refused: true, text: decline })
                record.refused = true
                finished = true
                break
              }
              await send({ type: 'sources', resources: shaped })
              continue
            }
            if (event.type === 'done') {
              if (event.refused) {
                if (
                  current.intent && supplementsOnly && attempts.length === 1 && !documentScope
                ) {
                  retry = 'supplements'
                  break
                }
                if (
                  !documentScope && !retriedWithoutPrequeries && bestRelevance >= STRONG_MATCH &&
                  ((current.prequeries?.length ?? 0) > 0 || current.intent)
                ) {
                  retry = 'prequeries'
                  break
                }
                await finishRefused()
              } else {
                await finishAnswered(event.text)
              }
              continue
            }
            if (event.type === 'usage') record.durationSec = event.totalSec ?? null
            if (event.type === 'quality') {
              record.answerRelevance = event.answerRelevance
              record.groundedness = event.groundedness
              record.contextRelevance = event.contextRelevance
            }
            if (event.type === 'error') record.failed = true
            if (!interpretedSent && interpreted) {
              interpretedSent = true
              await send({ type: 'interpreted', query: interpreted })
            }
            await send(event)
          }
        } catch (err) {
          record.failed = true
          await send({ type: 'error', message: publicErrorMessage(err) })
        }
        if (retry === 'supplements') {
          attempts.push({ intent: undefined, prequeries: current.prequeries })
          intentForAsk = undefined
          await fallbackEvent(
            'The supplementary data configuration could not answer from the data sheets it found.',
          )
        } else if (retry === 'prequeries') {
          // The generator, not the corpus, said no: a 90%-plus match was
          // retrieved. Ask once more with neither the safety prequeries nor
          // the intent's narrower configuration crowding the grounding set.
          retriedWithoutPrequeries = true
          attempts.push({ intent: undefined, prequeries: undefined })
        }
        retry = null
      }
      if (!finished && !record.failed && heldDecline) await finishRefused()
      try {
        insights.record(config.slug, {
          ts: new Date().toISOString(),
          question: query.slice(0, 500),
          answered: !record.failed && !record.refused && record.citations > 0,
          citations: record.citations,
          durationSec: record.durationSec,
          answerRelevance: record.answerRelevance,
          groundedness: record.groundedness,
          contextRelevance: record.contextRelevance,
        })
      } catch {
        // insights are best-effort - never fail the answer over them
      }
    }))
  })

  // The Help assistant: a grounded, cited answer about USING the portal,
  // scoped to the in-app documentation only (docScope). It uses the same
  // streamed ask contract as the research assistant, but never retrieves,
  // grounds or cites research content - and research ask never sees these docs.
  // Documentation questions are not logged to the research insights store.
  app.post('/api/t/:slug/docs/ask', expensiveRateLimit, async (c) => {
    const config = tenant(c.req.param('slug'))
    if (!config) return c.json({ error: 'unknown_tenant' }, 404)
    const parsed = docsAskBodySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid_query' }, 400)
    return streamSSE(c, async (stream) => {
      const { query, context } = parsed.data
      try {
        for await (
          const event of provider.ask(config, query, { context, docScope: true })
        ) {
          await stream.writeSSE({ data: JSON.stringify(event) })
        }
      } catch (err) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', message: publicErrorMessage(err) }),
        })
      }
    })
  })

  return app
}

/** The strongest matches first: what a decline names as the closest the corpus holds. */
function nearestTitles(resources: readonly ScoredResource[]): string[] {
  return [...resources].sort((a, b) => b.relevance - a.relevance).slice(0, 3).map((r) => r.title)
}

/** The same SSE response with an explicit UTF-8 charset on its content type. */
function withUtf8EventStream(res: Response): Response {
  try {
    res.headers.set('content-type', 'text/event-stream; charset=utf-8')
    return res
  } catch {
    const headers = new Headers(res.headers)
    headers.set('content-type', 'text/event-stream; charset=utf-8')
    return new Response(res.body, { status: res.status, headers })
  }
}
