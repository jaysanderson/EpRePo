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
  extractNumbers,
  figurePattern,
  isSampleSizeFigure,
  normaliseFigures,
  outcomeFamilies,
  type PreparedSource,
  qualifierForFigure,
  stripUnsupportedContraindications,
  studyDesignOf,
  verifyFigures,
  yearsUnsupported,
} from './answer-audit.ts'
import {
  carriesQualifier,
  cohortPapers,
  cohortTerms,
  figuresFoundIn,
  generatedText,
  isDeclineSentence,
  namesOtherStudy,
  ownFigureSentence,
  type PoolText,
  prepareIfNeeded,
  quoteSentence,
  replacementCue,
  rescueSentence,
  statesResultFigure,
  syntheticCitation,
  withQualifier,
} from './figure-rescue.ts'
import { markedSentences, secondhandFigures, secondhandNote } from './secondhand.ts'
import {
  bindSentences,
  looksLikeReferencePassage,
  namedEntities,
  stripReferenceSection,
} from './citation-binding.ts'
import {
  designLead,
  effectSizeNote,
  effectSizesFor,
  gateFigures,
  removalNote,
} from './answer-gate.ts'
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
  /** Sentences the figure gate removed, and the figures they stated. */
  sentencesRemoved: number
  figuresRemoved: string[]
  /** Figures found in a retrieved, prior-turn or DA text after the cited passages failed them. */
  figuresRescued?: string[]
  /** Sentences replaced by the named paper's own figure sentence. */
  sentencesReplaced?: number
  /** Titles of resources that carry a removed figure somewhere, though not beside its claim. */
  foundIn?: string[]
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
  /** Papers the study guard pinned, and the terms that pinned them. */
  pinnedResourceIds?: readonly string[]
  pinnedTerms?: readonly string[]
  /** Resources the session's earlier turns cited: a figure carried forward is checked against them. */
  priorResourceIds?: readonly string[]
}

export interface BindAndAuditResult {
  text: string
  citations: Citation[]
  audit: AuditEvent
  /** The sources with each cited resource's card passage re-chosen for the claims bound to it. */
  sources: ScoredResource[]
  /** The figure gate removed every sentence: nothing verifiable is left to show. */
  emptied: boolean
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

/** How many figures an answer states: the "Checking N figures" count the surface shows while the audit runs. */
export function figureCount(text: string): number {
  return extractNumbers(text.replace(/\s*\[\d{1,3}\]/g, '')).length
}

/** Words of a claim that say nothing about which paper it is about. */
const GENERIC_SENTENCE_WORDS = new Set([
  'patients',
  'study',
  'studies',
  'analysis',
  'cohort',
  'epilepsy',
  'months',
  'years',
  'their',
  'these',
  'those',
  'which',
  'there',
  'about',
  'other',
  'papers',
  'across',
  'among',
  'within',
  'after',
  'before',
  'between',
  'included',
  'reported',
  'achieved',
  'proportion',
  'rate',
  'rates',
  'outcome',
  'outcomes',
  'score',
  'scores',
  'specific',
  'another',
])

/** How many cited resources' texts are fetched for binding and audit. */
const MAX_CITED_TEXTS = 8
/** How many further resources' texts the rescue may fetch. */
const MAX_POOL_TEXTS = 8

/**
 * The texts a withheld figure is looked up in, best first: the cohort
 * papers, the pinned papers, the papers earlier turns cited, then the
 * retrieved resources by relevance - each paper's extracted text (fetched
 * now, cached per process) and its DA summary and key takeaways as a
 * text of its own. Cited texts already fetched are not repeated.
 */
async function poolTexts(
  input: BindAndAuditInput,
  fetched: ReadonlyMap<number, string>,
  cohort: ReadonlySet<string>,
  _terms: readonly string[],
): Promise<PoolText[]> {
  const fetchedIds = new Set(
    input.citations.filter((c) => fetched.has(c.index)).map((c) => c.resourceId),
  )
  const titleOf = new Map<string, string>()
  for (const s of input.sources) titleOf.set(s.id, s.title)
  for (const c of input.citations) {
    if (!titleOf.has(c.resourceId)) titleOf.set(c.resourceId, c.title)
  }
  for (const r of input.catalogue ?? []) if (!titleOf.has(r.id)) titleOf.set(r.id, r.title)
  const order: string[] = []
  const add = (id: string) => {
    if (!order.includes(id)) order.push(id)
  }
  for (const id of cohort) add(id)
  for (const id of input.pinnedResourceIds ?? []) add(id)
  for (const id of input.priorResourceIds ?? []) add(id)
  for (const s of [...input.sources].sort((a, b) => b.relevance - a.relevance)) {
    if (!s.referenceChunk) add(s.id)
  }
  const wanted = order.filter((id) => !fetchedIds.has(id)).slice(0, MAX_POOL_TEXTS)
  const out: PoolText[] = []
  const texts = await Promise.all(wanted.map(async (id) => {
    try {
      return { id, text: await extractionText(input.management, input.config, id) }
    } catch {
      return { id, text: undefined }
    }
  }))
  for (const { id, text } of texts) {
    if (text) out.push({ resourceId: id, title: titleOf.get(id) ?? '', text, generated: false })
  }
  // The DA fields of every known resource, cited or not, after the texts.
  for (const id of order) {
    const source = input.sources.find((s) => s.id === id)
    const generated = source ? generatedText(source) : undefined
    if (generated) {
      out.push({ resourceId: id, title: titleOf.get(id) ?? '', text: generated, generated: true })
    }
  }
  return out
}

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
  // The names the question uses (a cohort, a drug, a study) bind a sentence
  // only to a text that carries them; a study the question names by
  // acronym must be in every cited text (or its title) for it to be bound.
  const questionEntities = namedEntities(query, lexicon)
  const study = namedStudy(query)
  // The names a cited text must carry: the study the question names by
  // acronym, or any of the cohorts it designates (a question across two
  // studies binds to a paper that carries either).
  const terms = cohortTerms(query, input.pinnedTerms ?? [])
  const requiredNames = [...new Set([...(study ? [study.split(' ')[0]!] : []), ...terms])]
  const bound = bindSentences({
    text: input.text,
    citations: input.citations,
    texts,
    lexicon,
    belowFloor,
    questionEntities,
    ...(requiredNames.length > 0 ? { requiredName: requiredNames } : {}),
    // The gate renumbers once it has decided what stays.
    keepNumbering: true,
  })
  // Every cited text that carries the study the question names, in the
  // provider's numbering: what the gate checks an unbound sentence against,
  // and what it may lend a marker from. The display floor does not apply
  // here: a paper the platform cited that verifiably carries every figure
  // of a sentence beside its claim is that sentence's source whatever its
  // search score.
  const usableTexts = new Map<number, string>()
  for (const index of bound.named) {
    const t = texts.get(index)
    if (t !== undefined) usableTexts.set(index, t)
  }
  const oldIndexByResource = new Map(input.citations.map((c) => [c.resourceId, c.index]))
  const allTexts = [...usableTexts.values()]
  // Figures beside their own terms, in the texts each sentence is bound to,
  // then the gate: a sentence whose figures fail is removed, a figure
  // sentence with no marker inherits the one text that carries all of them
  // or is removed too. What remains has passed.
  const markerOfText = [...usableTexts.keys()]
  const textsByNew = new Map<number, string>()
  const withTexts = (sentences: readonly typeof bound.sentences[number][]) =>
    sentences.map((s) => ({
      text: s.text,
      texts: s.bound
        .map((n) => ({ index: n, text: textsByNew.get(n) }))
        .filter((t): t is { index: number; text: string } => t.text !== undefined),
    }))
  let checks = verifyFigures(
    bound.sentences.map((s) => ({
      text: s.text,
      texts: s.bound.map((n) => usableTexts.get(n)).filter((t): t is string => t !== undefined),
    })),
    allTexts,
    lexicon,
    questionEntities,
  )
  // A decline ("the cited sources do not provide ...") is the portal's
  // own state, not a claim: it carries no marker and is not gated (D3-15).
  const declines = new Set<string>()
  for (const sentence of bound.sentences) {
    if (!isDeclineSentence(sentence.text)) continue
    declines.add(sentence.text)
    sentence.bound = []
  }
  checks = checks.filter((c) => !declines.has(c.sentence))
  const resourceOfIndex = new Map(input.citations.map((c) => [c.index, c.resourceId]))
  const candidates: Citation[] = [...input.citations]
  // The cohort guard (D3-01, D3-07): when the question names a cohort or
  // study that titles some of the retrieved papers, a figure sentence may
  // cite only those papers - unless it names another study itself. A
  // sentence that fails goes to the rescue below with only the cohort
  // papers as candidates, and to the replacement after that.
  const knownResources = [
    ...input.sources,
    ...input.citations.filter((c) => !input.sources.some((s) => s.id === c.resourceId)).map((
      c,
    ) => ({
      id: c.resourceId,
      title: c.title,
    })),
  ]
  const cohort = cohortPapers(terms, knownResources)
  const cohortFailed = new Set<string>()
  if (cohort.size > 0) {
    for (const sentence of bound.sentences) {
      if (sentence.bound.length === 0 || !statesResultFigure(sentence.text)) continue
      if (namesOtherStudy(sentence.text, terms)) continue
      const ownChecks = checks.filter((c) => c.sentence === sentence.text)
      if (ownChecks.length === 0) continue
      const citesCohort = sentence.bound.some((n) => cohort.has(resourceOfIndex.get(n) ?? ''))
      if (citesCohort) continue
      cohortFailed.add(sentence.text)
      checks = checks.map((c) =>
        c.sentence === sentence.text
          ? { ...c, supported: false, supportedBy: [], reason: 'cohort' as const }
          : c
      )
    }
  }
  // The rescue (D3-02): a sentence the gate would remove is looked up in
  // the full text of every retrieved resource, the papers the session's
  // earlier turns cited and the DA summary and key takeaways, before it
  // is withheld. The texts are fetched only when something needs them.
  const failing = new Set(checks.filter((c) => !c.supported).map((c) => c.sentence))
  // An unbound sentence passes only when one text carries every figure
  // (the gate's inheritance rule); otherwise it needs the rescue too.
  for (const sentence of bound.sentences) {
    if (sentence.bound.length > 0) continue
    const own = checks.filter((c) => c.sentence === sentence.text)
    if (own.length === 0) continue
    const common = own.map((c) => new Set(c.supportedBy)).reduce<Set<number> | null>(
      (acc, set) => acc === null ? set : new Set([...acc].filter((n) => set.has(n))),
      null,
    )
    if (!common || common.size === 0) failing.add(sentence.text)
  }
  const rescued: { figures: string[]; resourceId: string }[] = []
  const prepared = new Map<string, PreparedSource>()
  const poolEntries: { index: number; text: PreparedSource; resourceId: string; title: string }[] =
    []
  const countDeclinePending = [...declines].some((d) =>
    /\b(?:number|how many|size|sizes|denominator|count)\b/i.test(d)
  )
  if (failing.size > 0 || countDeclinePending) {
    const pool = await poolTexts(input, texts, cohort, terms)
    let nextIndex = Math.max(0, ...input.citations.map((c) => c.index)) + 1
    for (const entry of pool) {
      const existing = candidates.find((c) => c.resourceId === entry.resourceId)
      const index = existing ? existing.index : nextIndex++
      if (!existing) {
        candidates.push(syntheticCitation(index, { id: entry.resourceId, title: entry.title }))
      }
      resourceOfIndex.set(index, entry.resourceId)
      poolEntries.push({
        index,
        text: prepareIfNeeded(entry.text, prepared),
        resourceId: entry.resourceId,
        title: entry.title,
      })
      if (!entry.generated && !texts.has(index)) texts.set(index, entry.text)
    }
    // A resource the study guard would reject cannot lend a marker either
    // - unless an earlier turn cited it, or the sentence names that other
    // study itself ("in the EXPERIENCE pooled analysis" under a PERMIT
    // question): a figure carried from the last answer is checked against
    // the paper it came from (D3-06).
    const prior = new Set(input.priorResourceIds ?? [])
    const named = (entry: { text: PreparedSource; title: string }) =>
      requiredNames.length === 0 ||
      requiredNames.some((name) =>
        new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
          `${entry.text.lower}\n${entry.title}`,
        )
      )
    for (const sentence of bound.sentences) {
      if (!failing.has(sentence.text)) continue
      const other = namesOtherStudy(sentence.text, terms)
      const restricted = cohortFailed.has(sentence.text) ||
        (cohort.size > 0 && statesResultFigure(sentence.text) && !other)
      const allowed = poolEntries.filter((e) => other || prior.has(e.resourceId) || named(e))
      const poolFor = restricted ? allowed.filter((e) => cohort.has(e.resourceId)) : [
        ...allowed.filter((e) => cohort.has(e.resourceId)),
        ...allowed.filter((e) => !cohort.has(e.resourceId)),
      ]
      const found = rescueSentence({ sentence, pool: poolFor, lexicon, questionEntities })
      if (!found) continue
      sentence.bound = [found.index]
      checks = [...checks.filter((c) => c.sentence !== sentence.text), ...found.checks]
      rescued.push({ figures: found.checks.map((c) => c.figure), resourceId: found.resourceId })
      failing.delete(sentence.text)
    }
  }
  // The replacement (D3-10): a sentence still failing about the question's
  // cohort or a pinned paper is replaced by that paper's own figure
  // sentence, quoted verbatim and cited, rather than dropped.
  const replaced: { from: string; resourceId: string }[] = []
  const replacementPapers = [...cohort]
  for (const id of input.pinnedResourceIds ?? []) {
    if (!replacementPapers.includes(id)) replacementPapers.push(id)
  }
  const questionOutcomes = outcomeFamilies(query)
  const quoted = new Set<string>()
  const MAX_REPLACEMENTS = 3
  if (failing.size > 0) {
    // What the answer already states: a quote that repeats it adds nothing.
    const stated = [
      ...new Set(
        bound.sentences.filter((s) => !failing.has(s.text)).flatMap((s) => extractNumbers(s.text)),
      ),
    ]
    for (const sentence of bound.sentences) {
      if (!failing.has(sentence.text) || declines.has(sentence.text)) continue
      // The named papers first; the paper the sentence itself cited only
      // when no named paper answers, and never for a sentence the cohort
      // guard failed (its cited paper is the wrong cohort by definition).
      // The paper the sentence itself cited before the block's shared
      // markers: the platform's own binding of that claim first.
      const papersOf = (indices: readonly number[]) =>
        indices.map((n) => resourceOfIndex.get(n))
          .filter((id): id is string => id !== undefined && !replacementPapers.includes(id))
      const own = cohortFailed.has(sentence.text)
        ? []
        : papersOf([...sentence.bound, ...(sentence.original ?? [])])
      const block = cohortFailed.has(sentence.text)
        ? []
        : papersOf(sentence.block ?? []).filter((id) => !own.includes(id))
      const cue = {
        ...replacementCue(sentence.text, lexicon, questionEntities, questionOutcomes, terms),
        exclude: stated,
      }
      let best: { quote: string; score: number; index: number; resourceId: string } | undefined
      if (replaced.length >= MAX_REPLACEMENTS) break
      // A sentence about another study is never answered from the
      // question's cohort paper: its own paper or nothing. After the
      // named papers, the sentence's own paper, its block's papers and
      // any retrieved paper that carries one of its figures compete on
      // score: a "231" the model misread is answered by the paper that
      // holds the 231.
      const named = namesOtherStudy(sentence.text, terms) ? [] : replacementPapers
      const figuresOfSentence = extractNumbers(sentence.text).filter((f) =>
        /%|\./.test(f) || /^\d{3,}$/.test(f)
      )
      // A retrieved paper answers a claim it was never cited for only when
      // its record reads as the claim's subject: two of the sentence's
      // content words in its title or summary ("autoimmune encephalitis
      // consortium"), not a SUDEP genomics paper that happens to carry an
      // 88 somewhere.
      const sentenceWords = new Set(
        (sentence.text.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []).filter((w) =>
          !GENERIC_SENTENCE_WORDS.has(w)
        ),
      )
      const aboutSentence = (id: string) => {
        const source = input.sources.find((s) => s.id === id)
        const record = `${source?.title ?? ''} ${source?.summary ?? ''}`.toLowerCase()
        const have = new Set(record.match(/[a-z][a-z-]{4,}/g) ?? [])
        let hits = 0
        for (const w of sentenceWords) if (have.has(w)) hits++
        return hits >= 2
      }
      const carrying = poolEntries
        .filter((e) =>
          !named.includes(e.resourceId) && !own.includes(e.resourceId) &&
          !block.includes(e.resourceId) && aboutSentence(e.resourceId) &&
          figuresOfSentence.some((f) => figurePattern(f).test(e.text.lower))
        )
        .map((e) => e.resourceId)
      for (const papers of [named, [...own, ...block, ...carrying]]) {
        // A paper the question did not name has to answer the sentence
        // clearly: the quote must carry the claim's names or two of its
        // words, and no quote is used twice in one answer.
        const bar = papers === named ? 0 : 11
        for (const id of papers) {
          const index = candidates.find((c) => c.resourceId === id)?.index
          const raw = index === undefined ? undefined : texts.get(index)
          if (index === undefined || !raw) continue
          const found = ownFigureSentence(raw, { ...cue, exclude: [...stated, ...quoted] })
          if (!found || found.score < bar || quoted.has(found.sentence)) continue
          if (!best || found.score > best.score) {
            best = { quote: found.sentence, score: found.score, index, resourceId: id }
          }
        }
        if (best) break
      }
      if (!best) continue
      quoted.add(best.quote)
      replaced.push({ from: sentence.text, resourceId: best.resourceId })
      sentence.text = quoteSentence(best.quote)
      sentence.bound = [best.index]
      checks = [
        ...checks.filter((c) => c.sentence !== sentence.text),
        ...extractNumbers(sentence.text).map((figure) => ({
          figure,
          sentence: sentence.text,
          supported: true,
          supportedBy: [0],
        })),
      ]
      failing.delete(sentence.text)
    }
  }
  // A decline about a count ("the number of patients in each group was
  // not specified") when a named paper's own findings state it: the
  // paper's sentence follows the decline, quoted and cited (D3-07).
  const countDeclines: { from: string; resourceId: string }[] = []
  if (declines.size > 0 && replacementPapers.length > 0) {
    for (let i = 0; i < bound.sentences.length; i++) {
      const sentence = bound.sentences[i]!
      if (!declines.has(sentence.text)) continue
      if (!/\b(?:number|how many|size|sizes|denominator|count)\b/i.test(sentence.text)) continue
      const previous = bound.sentences.slice(0, i).reverse().find((s) => !declines.has(s.text))
      const cue = replacementCue(
        `${previous?.text ?? ''} ${sentence.text}`,
        lexicon,
        questionEntities,
        [],
        terms,
      )
      let best: { quote: string; score: number; index: number; resourceId: string } | undefined
      for (const id of replacementPapers) {
        const index = candidates.find((c) => c.resourceId === id)?.index
        const raw = index === undefined ? undefined : texts.get(index)
        if (index === undefined || !raw) continue
        const found = ownFigureSentence(raw, { ...cue, outcomes: [], wantCount: true })
        if (found && (!best || found.score > best.score)) {
          best = { quote: found.sentence, score: found.score, index, resourceId: id }
        }
      }
      if (!best) continue
      countDeclines.push({ from: sentence.text, resourceId: best.resourceId })
      sentence.text = quoteSentence(best.quote)
      sentence.bound = [best.index]
      declines.delete(sentence.text)
      checks = [
        ...checks,
        ...extractNumbers(sentence.text).map((figure) => ({
          figure,
          sentence: sentence.text,
          supported: true,
          supportedBy: [0],
        })),
      ]
    }
  }
  // The population the passage states (D3-07): a kept figure sentence
  // whose supporting passage gives the figure for "patients with
  // psychiatric comorbidity" carries that qualifier when neither the
  // sentence nor the question does.
  const qualified: string[] = []
  for (const sentence of bound.sentences) {
    if (failing.has(sentence.text) || sentence.bound.length === 0) continue
    // A sentence that states its own population ("the whole cohort") is
    // not requalified, and a sample size's passage frames the count, not
    // the claim.
    if (
      /\b(?:whole|entire|overall|total|full|all)\s+(?:cohort|population|patients|participants|analysis set|sample)\b/i
        .test(sentence.text)
    ) continue
    const normalised = normaliseFigures(sentence.text).toLowerCase()
    const own = checks.filter((c) =>
      c.sentence === sentence.text && c.supported && c.passage &&
      !isSampleSizeFigure(c.figure, normalised) && !/(?:month|week|year|day|hour)s$/.test(c.figure)
    )
    for (const check of own) {
      // Every occurrence of the figure in the bound texts must open with
      // the same frame, or the figure is not that population's alone.
      const boundTexts = sentence.bound.map((n) => texts.get(n)).filter((t): t is string =>
        t !== undefined
      )
      const qualifiers = boundTexts.map((t) =>
        qualifierForFigure(check.figure, prepareIfNeeded(t, prepared))
      )
      const qualifier = qualifiers.length > 0 && qualifiers.every((q) => q === qualifiers[0])
        ? qualifiers[0]
        : undefined
      if (!qualifier) continue
      if (carriesQualifier(sentence.text, qualifier) || carriesQualifier(query, qualifier)) continue
      const before = sentence.text
      sentence.text = withQualifier(sentence.text, qualifier)
      checks = checks.map((c) => c.sentence === before ? { ...c, sentence: sentence.text } : c)
      qualified.push(qualifier)
      break
    }
  }
  const gated = allTexts.length > 0 || rescued.length > 0
    ? gateFigures(bound, checks, markerOfText, candidates)
    : {
      text: bound.text,
      sentences: bound.sentences,
      citations: bound.citations,
      renumber: new Map<number, number>(),
      removed: [],
      inherited: 0,
    }
  const figuresUnsupported = allTexts.length > 0 || rescued.length > 0
    ? []
    : [...new Set(checks.filter((c) => !c.supported).map((c) => c.figure))]
  const figuresRemoved = [...new Set(gated.removed.flatMap((r) => r.figures))]
  const foundIn = figuresRemoved.length > 0
    ? figuresFoundIn(figuresRemoved, [
      ...[...texts.entries()].map(([index, t]) => ({
        title: candidates.find((c) => c.index === index)?.title ?? '',
        text: prepareIfNeeded(t, prepared),
      })),
      ...poolEntries.map((e) => ({ title: e.title, text: e.text })),
    ]).filter((t) => t.length > 0)
    : []
  // The gate renumbered what it kept: the texts follow the new numbering.
  const citations = gated.citations
  for (const citation of citations) {
    const old = oldIndexByResource.get(citation.resourceId) ??
      candidates.find((c) => c.resourceId === citation.resourceId)?.index
    const t = old === undefined ? undefined : texts.get(old)
    if (t !== undefined) textsByNew.set(citation.index, t)
  }
  const sentenceTexts = withTexts(gated.sentences)
  let text = gated.text
  // A figure the cited paper carries only in its introduction or
  // discussion is that paper citing other studies: said so in one line,
  // and never asked for a denominator (D3-08, D3-13).
  const secondhand = secondhandFigures(markedSentences(text), textsByNew)
  const secondhandFigureSet = new Set(secondhand.map((f) => f.figure))
  // The cited paper's own finding follows a second-hand figure when it has
  // one for the same claim: "relapses occur in 14%-35%" from the
  // introduction, then the cohort's own "16 (30%) patients experienced at
  // least one relapse", quoted and cited (D3-10, D2-04).
  const ownFindings: string[] = []
  if (secondhand.length > 0) {
    const stated = new Set(extractNumbers(text.replace(/\s*\[\d{1,3}\]/g, '')))
    for (const marked of markedSentences(text)) {
      const own = secondhand.filter((f) =>
        marked.bound.includes(f.index) && extractNumbers(marked.text).includes(f.figure)
      )
      if (own.length === 0) continue
      const index = own[0]!.index
      const source = textsByNew.get(index)
      if (!source) continue
      const flagged = own.map((f) => f.figure)
      const cue = {
        ...replacementCue(marked.text, lexicon, questionEntities, outcomeFamilies(query)),
        exclude: [...stated],
        // The paper's own finding must be of the same kind as the figure
        // it replaces: a rate for a rate, never a sample count.
        kinds: {
          share: flagged.some((f) => f.endsWith('%')),
          count: false,
          ratio: false,
          decimal: flagged.some((f) => /\d\.\d/.test(f)),
        },
      }
      if (cue.outcomes.length === 0) continue
      const found = ownFigureSentence(source, cue)
      if (!found) continue
      const quote = quoteSentence(found.sentence).replace(
        /^The paper itself reports:/,
        "The paper's own finding:",
      )
      const pattern = new RegExp(
        `${marked.text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}((?:\\s*\\[\\d{1,3}\\])*)`,
      )
      if (!pattern.test(text)) continue
      text = text.replace(pattern, (m) => `${m} ${quote}[${index}]`)
      ownFindings.push(found.sentence)
      for (const f of extractNumbers(found.sentence)) stated.add(f)
    }
  }
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
  const attributed = correctAttributions(text, input.authors ?? [], citations, authorsOf)
  text = attributed.text
  const attributionsCorrected = [...new Set(attributed.fixes.map((f) => f.surname))]

  // Proportions stated without their n, and the n the cited passage gives.
  const denominators = denominatorsMissing(sentenceTexts).filter((d) =>
    !secondhandFigureSet.has(d.figure)
  )

  // The effect size the passage carries when the answer paraphrased it away.
  const effectSizes = effectSizesFor(
    query,
    text,
    [...textsByNew.entries()]
      .filter(([index]) => {
        const id = citations.find((c) => c.index === index)?.resourceId
        return cohort.size === 0 || (id !== undefined && cohort.has(id))
      })
      .map(([index, t]) => ({ index, text: t })),
    lexicon,
  )

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
    for (const citation of citations) {
      const source = textsByNew.get(citation.index)
      if (!source) continue
      const first = gated.sentences.find((s) => s.bound.includes(citation.index))
      if (!first || DESIGN_WORD.test(first.text)) continue
      const design = studyDesignOf(source)
      if (design) designs.push({ index: citation.index, design })
    }
  }
  // Study design first, on every intent: a modelling, simulation or
  // preclinical paper is named as such before its findings are read.
  const kindOf = (id: string) => byId.get(id)?.kind ?? catalogueById.get(id)?.kind
  const lead = designLead(
    citations.map((c) => ({
      index: c.index,
      title: c.title,
      ...(kindOf(c.resourceId) ? { kind: kindOf(c.resourceId) } : {}),
      ...(textsByNew.has(c.index) ? { text: textsByNew.get(c.index) } : {}),
    })),
    gated.sentences,
  )
  if (lead && text.trim()) text = `${lead}\n\n${text}`

  // The corpus boundary for a study the question names.
  const citedTitles = citations.map((c) => c.title)
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

  if (text.trim()) {
    text += auditAddendum({
      missingDrugs,
      missingNumbers: figuresUnsupported,
      missingYears,
      denominators,
      designs,
      attributions: attributed.fixes,
      notes: [
        removalNote(gated.removed, {
          foundIn,
          replaced: replaced.length,
          counted: countDeclines.length,
        }),
        effectSizeNote(effectSizes),
        boundary,
        scoped,
        secondhandNote(secondhand),
      ].filter((n): n is string => n !== undefined),
    })
  }

  // Each cited resource's card passage: the paragraph that carries the
  // claims bound to it, from retrieval's paragraphs (paged) or the text.
  const sources = input.sources.map((source) => {
    const citation = citations.find((c) => c.resourceId === source.id)
    if (!citation) return source
    const sentences = gated.sentences.filter((s) => s.bound.includes(citation.index)).map((s) =>
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
    citations,
    sources,
    emptied: gated.removed.length > 0 && gated.sentences.length === 0,
    audit: {
      type: 'audit',
      figuresChecked: checks.length,
      figuresUnsupported,
      yearsUnsupported: missingYears,
      contraindicationsUnsupported,
      sentencesChecked: bound.sentences.length,
      sentencesCited: gated.sentences.filter((s) => s.bound.length > 0).length,
      denominatorsMissing: denominators.map((d) => d.figure),
      attributionsCorrected,
      sentencesRemoved: gated.removed.length,
      figuresRemoved,
      figuresRescued: [...new Set(rescued.flatMap((r) => r.figures))],
      sentencesReplaced: replaced.length + countDeclines.length,
      foundIn,
    },
  }
}
