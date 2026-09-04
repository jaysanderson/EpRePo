import type { ScoredResource } from '@research-portal/core'

/**
 * Source attribution for structured artefacts (Generate and Assessment).
 *
 * The model is asked to name, per briefing section and per quiz question, the
 * title of the context source it drew on. A model-written title is only ever
 * shown if it names a source that was actually retrieved for the request -
 * matched against the merchandised title and the raw source name - and it is
 * resolved to that resource's id so the reader can open it. An invented or
 * unmatched attribution is dropped, never displayed (the comparison matrix's
 * rule, applied to the other artefacts).
 */

export interface AttributedSource {
  resourceId: string
  title: string
}

/** Instruction appended to the system prompt for a briefing (roadmap R22, P6-07). */
export const BRIEFING_INSTRUCTIONS =
  'You are writing a research briefing for a specialist reader. Every section must be built ' +
  'from the retrieved passages and must carry the concrete figures those passages report - ' +
  'effect sizes, sensitivities, AUCs, hazard ratios, cohort sizes, follow-up lengths, dataset ' +
  'names, doses - with the study or first author named beside each figure. Never write a ' +
  "generality where the passages give a number. In each section's `sources` list the exact " +
  'titles of the context documents that section draws on; a section with no source will be ' +
  'discarded, so only write sections the passages support. Australian English.'

/** Instruction appended to the system prompt for an assessment quiz (roadmap R21, P8-11). */
export const ASSESSMENT_INSTRUCTIONS =
  'You are writing a knowledge check for a specialist reader. Every question must be answerable ' +
  "from one retrieved passage; put that document's exact title in `source` and copy eight to " +
  'twenty words of that passage, verbatim, into `source_quote`. Write stems about '
'what the sources actually report - a figure, a proportion, an effect size, a comparison ' +
  'between two interventions, groups or study designs - and make every distractor a plausible ' +
  'value or claim a specialist could mistake for the answer, never an obviously absurd option. ' +
  'Australian English.'

const normalise = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim()

/** Content words of a title: four or more letters, lower-cased, de-duplicated. */
const contentWords = (value: string): Set<string> =>
  new Set((value.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []).filter((w) => !STOP.has(w)))

const STOP = new Set(['with', 'from', 'that', 'this', 'study', 'analysis', 'using', 'their'])

/**
 * The share of the label's content words that also appear in the title. A
 * model paraphrases or shortens titles ("the Retrospective Linkage Study of
 * AE project" for "Retrospective linkage study of autoimmune encephalitis in
 * Australia: protocol"), so containment alone misses real attributions.
 */
export const MIN_WORD_OVERLAP = 0.6

function wordOverlap(label: string, title: string): number {
  const a = contentWords(label)
  if (a.size < 3) return 0
  const b = contentWords(title)
  let hits = 0
  for (const w of a) if (b.has(w)) hits++
  return hits / a.size
}

/**
 * Resolve a model-written source label to a retrieved resource. Exact or
 * containment matches on the merchandised title or the raw source name win
 * outright; otherwise the title sharing the most content words with the
 * label wins if at least `MIN_WORD_OVERLAP` of the label's words appear in
 * it. A label shorter than four characters never matches.
 */
export function resolveSource(
  label: string,
  sources: Pick<ScoredResource, 'id' | 'title' | 'sourceName'>[],
): AttributedSource | null {
  const wanted = normalise(label)
  if (wanted.length < 4) return null
  for (const source of sources) {
    const candidates = [source.title, source.sourceName]
      .filter((t): t is string => Boolean(t))
      .map(normalise)
      .filter((t) => t.length >= 4)
    if (candidates.some((t) => t === wanted || t.includes(wanted) || wanted.includes(t))) {
      return { resourceId: source.id, title: source.title }
    }
  }
  let best: { source: (typeof sources)[number]; overlap: number } | null = null
  for (const source of sources) {
    const overlap = Math.max(
      wordOverlap(wanted, source.title),
      source.sourceName ? wordOverlap(wanted, source.sourceName) : 0,
    )
    if (overlap >= MIN_WORD_OVERLAP && (!best || overlap > best.overlap)) best = { source, overlap }
  }
  return best ? { resourceId: best.source.id, title: best.source.title } : null
}

export interface BriefingSectionIn {
  heading?: string
  content?: string
  sources?: unknown
}

export interface AttributedBriefingSection {
  heading: string
  content: string
  sources: AttributedSource[]
}

/**
 * Attribute a briefing's sections and refuse the ones nothing supports. A
 * section keeps only the sources that resolve to retrieved resources; a
 * section left with none is removed and its heading reported in
 * `omitted_sections`, so the reader sees what was withheld rather than an
 * unsourced paragraph presented as fact.
 */
export function attributeBriefing(
  object: { sections?: unknown } & Record<string, unknown>,
  sources: Pick<ScoredResource, 'id' | 'title' | 'sourceName'>[],
): {
  sections: AttributedBriefingSection[]
  omitted_sections: string[]
} & Record<string, unknown> {
  const sections: AttributedBriefingSection[] = []
  const omitted: string[] = []
  const raw = Array.isArray(object.sections) ? object.sections as BriefingSectionIn[] : []
  for (const section of raw) {
    const heading = typeof section?.heading === 'string' ? section.heading.trim() : ''
    const content = typeof section?.content === 'string' ? section.content.trim() : ''
    if (!heading && !content) continue
    const labels = Array.isArray(section.sources)
      ? section.sources.filter((s): s is string => typeof s === 'string')
      : []
    const resolved: AttributedSource[] = []
    for (const label of labels) {
      const match = resolveSource(label, sources)
      if (match && !resolved.some((r) => r.resourceId === match.resourceId)) resolved.push(match)
    }
    if (resolved.length === 0) {
      omitted.push(heading || content.slice(0, 60))
      continue
    }
    sections.push({ heading, content, sources: resolved })
  }
  return { ...object, sections, omitted_sections: omitted }
}

export interface QuizQuestionIn {
  source?: unknown
  source_quote?: unknown
  [key: string]: unknown
}

/** Share of a quote's content words that a passage must carry to count as its origin. */
export const MIN_QUOTE_OVERLAP = 0.7

/**
 * Resolve a verbatim quote to the retrieved resource whose grounding passage
 * carries it. The model sees passages, not titles, so a quote is the
 * attribution it can actually make reliably; a title is checked first
 * because when the model does know it, it is exact. A quote is matched by
 * content-word overlap against every passage, best passage wins, and it
 * needs at least four content words to count.
 */
export function resolveByQuote(
  quote: string,
  passagesByResource: Record<string, string[]>,
): string | null {
  const words = contentWords(quote)
  if (words.size < 4) return null
  let best: { id: string; overlap: number } | null = null
  for (const [id, passages] of Object.entries(passagesByResource)) {
    for (const passage of passages) {
      const have = contentWords(passage)
      let hits = 0
      for (const w of words) if (have.has(w)) hits++
      const overlap = hits / words.size
      if (overlap >= MIN_QUOTE_OVERLAP && (!best || overlap > best.overlap)) best = { id, overlap }
    }
  }
  return best?.id ?? null
}

/**
 * Rotate a question's options so the correct answer is not always first.
 * The model reliably writes the correct option first and points
 * `correct_index` at 0, which a test-taker learns in two questions. The
 * rotation is by question position, so it is deterministic and keeps the
 * option order otherwise intact.
 */
export function rotateOptions(
  question: QuizQuestionIn,
  position: number,
): QuizQuestionIn {
  const options = Array.isArray(question.options)
    ? question.options.filter((o): o is string => typeof o === 'string')
    : []
  const correct = typeof question.correct_index === 'number' ? question.correct_index : 0
  if (options.length < 2 || correct < 0 || correct >= options.length) return question
  const shift = position % options.length
  const rotated = options.map((_, i) => options[(i - shift + options.length) % options.length]!)
  return { ...question, options: rotated, correct_index: (correct + shift) % options.length }
}

/**
 * Attribute quiz questions: `source` (the model's title) becomes
 * `source_resource_id` plus `source_title` when it resolves; otherwise both
 * are null and the question stands without an attribution rather than with
 * an invented one. Options are rotated per question (see `rotateOptions`).
 */
export function attributeQuiz(
  object: { questions?: unknown } & Record<string, unknown>,
  sources: Pick<ScoredResource, 'id' | 'title' | 'sourceName'>[],
  passagesByResource: Record<string, string[]> = {},
): Record<string, unknown> {
  const raw = Array.isArray(object.questions) ? object.questions as QuizQuestionIn[] : []
  const questions = raw.map((question, position) => {
    const label = typeof question.source === 'string' ? question.source : ''
    const quote = typeof question.source_quote === 'string' ? question.source_quote : ''
    let match = label ? resolveSource(label, sources) : null
    if (!match && quote) {
      const id = resolveByQuote(quote, passagesByResource)
      const source = id ? sources.find((s) => s.id === id) : undefined
      if (source) match = { resourceId: source.id, title: source.title }
    }
    const { source: _source, source_quote: _quote, ...rest } = rotateOptions(question, position)
    return {
      ...rest,
      source_resource_id: match?.resourceId ?? null,
      source_title: match?.title ?? null,
      // The model's own label and quote, kept for audit only - never shown as an attribution.
      source_label: label || null,
      source_quote: quote || null,
    }
  })
  return { ...object, questions }
}
