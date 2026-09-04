/**
 * The ask handler's grounding helpers: the cited texts it binds and audits
 * against, the context it adds beside retrieval, and the one pass that
 * turns the provider's paragraph-bound answer into a sentence-bound,
 * audited one (docs/EPREPO-ROADMAP.md R2 to R5).
 */
import type { Citation, ResourceSummary, ScoredResource, TenantConfig } from '@research-portal/core'
import {
  auditAddendum,
  denominatorsMissing,
  drugsFlaggedInSources,
  drugsMissingFromAnswer,
  stripUnsupportedContraindications,
  studyDesignOf,
  verifyFigures,
  yearsUnsupported,
} from './answer-audit.ts'
import {
  bindSentences,
  looksLikeReferencePassage,
  stripReferenceSection,
} from './citation-binding.ts'
import { correctAttributions, type NamedAuthor } from './ask-author.ts'
import { choosePassage, paragraphsOf } from './evidence-passages.ts'
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
  sentencesChecked: number
  sentencesCited: number
  denominatorsMissing: string[]
  attributionsCorrected: string[]
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

/**
 * Reference-list hits keep their flag but lose the bibliography paragraph
 * and its page. A passage the provider did not flag is checked here too:
 * mid-list chunks slip past its density heuristic.
 */
export function withoutReferencePassages(resources: ScoredResource[]): ScoredResource[] {
  return resources.map((r) => {
    const reference = r.referenceChunk ||
      (r.matchedPassage !== undefined && looksLikeReferencePassage(r.matchedPassage))
    if (!reference) return r
    const { matchedPassage: _passage, matchedPage: _page, matchedField: _field, ...rest } = r
    return { ...rest, referenceChunk: true }
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
  /** The catalogue, for author lists and titles the sources may lack. */
  catalogue?: readonly ResourceSummary[]
  /** Authors the question named that the catalogue recognises (retrieval was scoped to them). */
  authors?: readonly NamedAuthor[]
}

export interface BindAndAuditResult {
  text: string
  citations: Citation[]
  audit: AuditEvent
  /** The sources with each cited resource's card passage re-chosen for the claims bound to it. */
  sources: ScoredResource[]
}

// ---------------------------------------------------------------------------
// The corpus boundary for a named study
// ---------------------------------------------------------------------------

/** Acronyms a question uses that are never study names. */
const NOT_A_STUDY =
  /^(?:EEG|ECG|EMG|MRI|PET|CT|SPECT|ASM|ASMS|AED|AEDS|SUDEP|PNES|IGE|JME|CAE|JAE|GGE|DRE|TLE|FLE|MTLE|QOL|QALY|PRO|PROS|RCT|RCTS|CI|HR|OR|RR|SD|IQR|AUC|FDA|TGA|PBS|NHS|WHO|ILAE|SEEG|RFTC|LITT|VNS|DBS|RNS|LGS|CBD|THC|GWAS|DNA|RNA|PCR|CSF|NMDAR|LGI1|CASPR2|GABA|MOG|AQP4|GTCS|FBTCS|FS|HS|TBI|ICU|ED|GP|MDT|AI|ML|API|PDF|USA|UK|EU|II|III|IV)$/

/**
 * A study, trial or register the question names by acronym ("SANAD II",
 * "the BREATHS trial", "PERMIT pooled analysis"): an all-caps token of
 * three letters or more that either carries a numeral or sits beside a
 * study word. Null when the question names none.
 */
export function namedStudy(query: string): string | null {
  const words = query.split(/\s+/)
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]!.replace(/[^A-Za-z0-9-]/g, '')
    if (!/^[A-Z][A-Z0-9-]{2,}$/.test(raw) || NOT_A_STUDY.test(raw)) continue
    const next = (words[i + 1] ?? '').replace(/[^A-Za-z0-9]/g, '')
    const numeral = /^(?:II|III|IV|V|2|3|4)$/.test(next)
    const near = words.slice(Math.max(0, i - 2), i + 4).join(' ').toLowerCase()
    const studyWord =
      /\b(?:trial|study|protocol|analysis|analyses|cohort|register|registry|programme|program|consortium)\b/
        .test(near)
    if (numeral) return `${raw} ${next}`
    if (studyWord) return raw
  }
  return null
}

/**
 * The boundary sentence for a named study: none when a cited or catalogued
 * title carries its name; otherwise whether the collection holds it at all,
 * so the reader can tell coverage from evidence.
 */
export function unheldStudyNote(
  query: string,
  citedTitles: readonly string[],
  catalogueTitles: readonly string[],
): string | undefined {
  const study = namedStudy(query)
  if (!study) return undefined
  const head = study.split(' ')[0]!
  const carries = (title: string) => new RegExp(`\\b${head}\\b`, 'i').test(title)
  if (citedTitles.some(carries)) return undefined
  if (catalogueTitles.some(carries)) {
    return `*This collection holds ${study} itself, but the answer above did not cite it: the ` +
      'statements come from sources that refer to it. Search the Library for the study to read it directly.*'
  }
  return `*This collection does not hold ${study} itself. The statements above come from ` +
    'sources that cite it second-hand; verify against the original before relying on them.*'
}

/** Words that name a study design, for the clinical variant's first-citation check. */
const DESIGN_WORD =
  /\b(?:randomi[sz]ed|trial|cohort|case-control|case series|case report|cross-sectional|survey|model(?:ling)?|simulation|simulated|review|meta-analysis|pooled analysis|protocol|first-in-human|observational|retrospective|prospective)\b/i

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
  const catalogueById = new Map((input.catalogue ?? []).map((r) => [r.id, r]))
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

  // "X and colleagues" over a paper X did not write is rewritten to the
  // paper's own first author.
  const authorsOf = (id: string) => byId.get(id)?.authors ?? catalogueById.get(id)?.authors
  const attributed = correctAttributions(text, input.authors ?? [], bound.citations, authorsOf)
  text = attributed.text
  const attributionsCorrected = [...new Set(attributed.fixes.map((f) => f.surname))]

  // Figures beside their own terms, in the texts each sentence is bound to.
  const sentenceTexts = bound.sentences.map((s) => ({
    text: s.text,
    texts: s.bound
      .map((n) => ({ index: n, text: textsByNew.get(n) }))
      .filter((t): t is { index: number; text: string } => t.text !== undefined),
  }))
  const checks = verifyFigures(
    sentenceTexts.map((s) => ({ text: s.text, texts: s.texts.map((t) => t.text) })),
    allTexts,
    lexicon,
  )
  const figuresUnsupported = [...new Set(checks.filter((c) => !c.supported).map((c) => c.figure))]

  // Proportions stated without their n, and the n the cited passage gives.
  const denominators = denominatorsMissing(sentenceTexts)

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

  // Study designs for the clinical variant: each source's own description,
  // named where the first sentence citing it did not.
  const designs: { index: number; design: string }[] = []
  if (variant === 'safety') {
    for (const citation of bound.citations) {
      const source = textsByNew.get(citation.index)
      if (!source) continue
      const first = bound.sentences.find((s) => s.bound.includes(citation.index))
      if (!first || DESIGN_WORD.test(first.text)) continue
      const design = studyDesignOf(source)
      if (design) designs.push({ index: citation.index, design })
    }
  }

  // The corpus boundary for a study the question names.
  const citedTitles = bound.citations.map((c) => c.title)
  const boundary = unheldStudyNote(
    query,
    citedTitles,
    (input.catalogue ?? []).map((r) => r.title),
  )

  const scoped = input.authors && input.authors.length > 0
    ? `*Retrieval was limited to the ${
      input.authors.map((a) => `${a.resourceIds.length} resources authored by ${a.surname}`).join(
        ' and ',
      )
    } in this collection.*`
    : undefined

  text += auditAddendum({
    missingDrugs,
    missingNumbers: figuresUnsupported,
    missingYears,
    denominators,
    designs,
    attributions: attributed.fixes,
    notes: [boundary, scoped].filter((n): n is string => n !== undefined),
  })

  // Each cited resource's card passage: the paragraph that carries the
  // claims bound to it, from retrieval's paragraphs (paged) or the text.
  const sources = input.sources.map((source) => {
    const citation = bound.citations.find((c) => c.resourceId === source.id)
    if (!citation) return source
    const sentences = bound.sentences.filter((s) => s.bound.includes(citation.index)).map((s) =>
      s.text
    )
    const extracted = textsByNew.get(citation.index)
    const choice = choosePassage(
      sentences,
      source.passages ?? [],
      extracted ? paragraphsOf(extracted).slice(0, 400) : [],
      lexicon,
    )
    if (!choice) return source
    const { matchedPage: _page, referenceChunk: _reference, ...rest } = source
    return {
      ...rest,
      matchedPassage: choice.passage,
      ...(choice.page !== undefined ? { matchedPage: choice.page } : {}),
      matchedField: 'body' as const,
    }
  })

  return {
    text,
    citations: bound.citations,
    sources,
    audit: {
      type: 'audit',
      figuresChecked: checks.length,
      figuresUnsupported,
      yearsUnsupported: missingYears,
      contraindicationsUnsupported,
      sentencesChecked: bound.sentences.length,
      sentencesCited: bound.sentences.filter((s) => s.bound.length > 0).length,
      denominatorsMissing: denominators.map((d) => d.figure),
      attributionsCorrected,
    },
  }
}
