/**
 * The ask handler's grounding helpers: the cited texts it binds and audits
 * against, the context it adds beside retrieval, and the one pass that
 * turns the provider's paragraph-bound answer into a sentence-bound,
 * audited one (docs/EPREPO-ROADMAP.md R2 to R5).
 */
import type { Citation, ScoredResource, TenantConfig } from '@research-portal/core'
import {
  auditAddendum,
  drugsFlaggedInSources,
  drugsMissingFromAnswer,
  stripUnsupportedContraindications,
  verifyFigures,
  yearsUnsupported,
} from './answer-audit.ts'
import { bindSentences, stripReferenceSection } from './citation-binding.ts'
import {
  isMedicationTerm,
  isTreatmentDecisionQuestion,
  isTreatmentSelectionQuestion,
} from './ask-prequeries.ts'

/** What the handler needs from the management surface: a resource's extracted text. */
export interface ExtractionSource {
  resourceExtraction(tenant: TenantConfig, id: string): Promise<{ text: string }>
}

/** The `audit` ask event (packages/core AskEventSchema). */
export interface AuditEvent {
  type: 'audit'
  figuresChecked: number
  figuresUnsupported: string[]
  yearsUnsupported: string[]
  contraindicationsUnsupported: string[]
}

// ---------------------------------------------------------------------------
// Cited texts, fetched once per resource
// ---------------------------------------------------------------------------

const CACHE_CAP = 80
const extractionCache = new Map<string, Promise<string>>()

/**
 * A resource's extracted text with its reference list removed, cached per
 * process so the same paper is not re-fetched for every answer that cites
 * it. A failed fetch is not cached.
 */
export function extractionText(
  management: ExtractionSource,
  config: TenantConfig,
  id: string,
): Promise<string> {
  const key = `${config.slug}:${id}`
  const hit = extractionCache.get(key)
  if (hit) return hit
  const pending = management.resourceExtraction(config, id).then(
    (r) => stripReferenceSection(r.text),
    (err) => {
      extractionCache.delete(key)
      throw err
    },
  )
  extractionCache.set(key, pending)
  if (extractionCache.size > CACHE_CAP) {
    const oldest = extractionCache.keys().next().value
    if (oldest) extractionCache.delete(oldest)
  }
  return pending
}

// ---------------------------------------------------------------------------
// Sources as shown: never a bibliography paragraph as the passage
// ---------------------------------------------------------------------------

/** Reference-list hits keep their flag but lose the bibliography paragraph and its page. */
export function withoutReferencePassages(resources: ScoredResource[]): ScoredResource[] {
  return resources.map((r) => {
    if (!r.referenceChunk) return r
    const { matchedPassage: _passage, matchedPage: _page, matchedField: _field, ...rest } = r
    return rest
  })
}

// ---------------------------------------------------------------------------
// Context the application adds beside retrieval
// ---------------------------------------------------------------------------

export const DOCUMENT_CHAT_ADDENDUM =
  "You are answering about one document only. Preserve each statistic's name exactly as " +
  'the document gives it - a mean is not a median, a hazard ratio is not a relative risk - ' +
  'and correct the question when it names the wrong one. When the question asks "which", ' +
  'enumerate every item the document names, not only the first. Tables and key-resources ' +
  'blocks supplied with the sources are part of the document. If the document does not ' +
  'address the question, say "This document does not state" that plainly, and never write ' +
  '"the context" or "Not enough data".'

/**
 * The parts of a document that retrieval by paragraph tends to miss: its
 * pipe tables and the key-resources or STAR-methods block. Returned as
 * blocks of at most 1,500 characters, at most 6,000 in total.
 */
export function documentContextBlocks(text: string): string[] {
  const lines = text.split('\n')
  const blocks: string[] = []
  let table: string[] = []
  const flushTable = () => {
    if (table.length >= 2) blocks.push(table.join('\n'))
    table = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (/^\s*\|.*\|\s*$/.test(line)) {
      table.push(line.trim())
      continue
    }
    flushTable()
    if (
      /\b(key resources? table|star methods|experimental models?|organisms?\/strains?|resource availability|reagent or resource)\b/i
        .test(line)
    ) {
      const block = lines.slice(i, i + 25).join('\n').trim()
      if (block) blocks.push(block)
    }
  }
  flushTable()
  const out: string[] = []
  let total = 0
  const seen = new Set<string>()
  for (const block of blocks) {
    const clipped = block.slice(0, 1500)
    if (seen.has(clipped)) continue
    seen.add(clipped)
    if (total + clipped.length > 6000) break
    out.push(clipped)
    total += clipped.length
  }
  return out
}

/** "Publication years of the matching resources" for the recency prompt. */
export function publicationYearsContext(resources: readonly ScoredResource[]): string {
  const lines = resources
    .map((r) => {
      const year = r.year ?? r.published?.slice(0, 4)
      return year ? `- ${r.title} (${year})` : null
    })
    .filter((l): l is string => l !== null)
    .slice(0, 12)
  return lines.length > 0
    ? 'Publication years of the portal resources that match this question, from their ' +
      `records - state a study's year only from this list or the source text:\n${lines.join('\n')}`
    : ''
}

// ---------------------------------------------------------------------------
// Bind and audit
// ---------------------------------------------------------------------------

export interface BindAndAuditInput {
  management: ExtractionSource
  config: TenantConfig
  query: string
  text: string
  citations: readonly Citation[]
  sources: readonly ScoredResource[]
  lexicon: readonly string[]
  variant: string | undefined
  floor: number
}

export interface BindAndAuditResult {
  text: string
  citations: Citation[]
  audit: AuditEvent
}

/** How many cited resources' texts are fetched for binding and audit. */
const MAX_CITED_TEXTS = 8

/**
 * Sentence-level binding followed by the audit, over the extracted texts of
 * the cited resources. The bound text carries the renumbered markers; the
 * audit addendum is appended to it; the `audit` event summarises what was
 * checked so the surface can badge the answer and mark figures inline.
 */
export async function bindAndAudit(input: BindAndAuditInput): Promise<BindAndAuditResult> {
  const { config, query, lexicon, variant } = input
  const texts = new Map<number, string>()
  await Promise.all(
    input.citations.slice(0, MAX_CITED_TEXTS).map(async (citation) => {
      try {
        texts.set(
          citation.index,
          await extractionText(input.management, config, citation.resourceId),
        )
      } catch {
        // An unfetchable text leaves its citation unverifiable, not dropped.
      }
    }),
  )
  const byId = new Map(input.sources.map((s) => [s.id, s]))
  const belowFloor = new Set(
    input.citations
      .filter((c) => (byId.get(c.resourceId)?.relevance ?? 1) < input.floor)
      .map((c) => c.index),
  )
  const bound = bindSentences({
    text: input.text,
    citations: input.citations,
    texts,
    lexicon,
    belowFloor,
  })
  // Texts keyed by the new numbering, for the checks that name a marker.
  const oldIndexByResource = new Map(input.citations.map((c) => [c.resourceId, c.index]))
  const textsByNew = new Map<number, string>()
  for (const citation of bound.citations) {
    const old = oldIndexByResource.get(citation.resourceId)
    const text = old === undefined ? undefined : texts.get(old)
    if (text !== undefined) textsByNew.set(citation.index, text)
  }
  const allTexts = [...textsByNew.values()]
  let text = bound.text
  // The drug checks read the medication entries of the lexicon only: a
  // syndrome name in the same list is never "contraindicated".
  const medications = lexicon.filter(isMedicationTerm)

  // Contraindications the sources never state are removed (safety variant,
  // or any treatment-decision question).
  let contraindicationsUnsupported: string[] = []
  if (variant === 'safety' || isTreatmentDecisionQuestion(query)) {
    const stripped = stripUnsupportedContraindications(text, allTexts, medications)
    text = stripped.text
    contraindicationsUnsupported = stripped.unsupported
  }

  // Figures beside their own terms, in the texts each sentence is bound to.
  const checks = verifyFigures(
    bound.sentences.map((s) => ({
      text: s.text,
      texts: s.bound.map((n) => textsByNew.get(n)).filter((t): t is string => t !== undefined),
    })),
    allTexts,
    lexicon,
  )
  const figuresUnsupported = [...new Set(checks.filter((c) => !c.supported).map((c) => c.figure))]

  // Years from resource metadata, then the texts. Every retrieved source
  // counts, not only the cited ones: a recency answer names the newest
  // paper retrieval found even when the platform bound no marker to it.
  const metadataYears = input.sources
    .flatMap((s) => [s.year, s.published?.slice(0, 4)])
    .filter((y): y is string => typeof y === 'string' && y.length >= 4)
  const missingYears = allTexts.length > 0 ? yearsUnsupported(text, metadataYears, allTexts) : []

  // Drugs the sources flag that a which-drug answer left out.
  const missingDrugs = variant === 'safety' && isTreatmentSelectionQuestion(query)
    ? drugsMissingFromAnswer(
      text,
      drugsFlaggedInSources(
        [...textsByNew.entries()].map(([index, t]) => ({ index, text: t })),
        medications,
      ),
    )
    : []

  text += auditAddendum({ missingDrugs, missingNumbers: figuresUnsupported, missingYears })
  return {
    text,
    citations: bound.citations,
    audit: {
      type: 'audit',
      figuresChecked: checks.length,
      figuresUnsupported,
      yearsUnsupported: missingYears,
      contraindicationsUnsupported,
    },
  }
}
