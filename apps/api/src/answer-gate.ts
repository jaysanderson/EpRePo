/**
 * The figure gate: what the audit found becomes a decision about the text,
 * not a footnote under it. A sentence whose figures the cited passages do
 * not carry beside the claim - about that outcome, at that follow-up, for
 * the cohort, drug or study the sentence names - is removed, and the answer
 * says so. A figure sentence with no marker inherits the marker of the one
 * cited text that carries every figure it states, or goes the same way.
 * Alongside it: the effect size a cited passage carries for the question
 * when the answer stated none, and the study-design line that leads an
 * answer grounded on a modelling or preclinical paper. Deterministic, no
 * model in the loop.
 */
import type { Citation } from '@research-portal/core'
import type { BindResult, BoundSentence } from './citation-binding.ts'
import { renderBound } from './citation-binding.ts'
import {
  type FigureCheck,
  normaliseSource,
  outcomeFamilies,
  studyDesignOf,
} from './answer-audit.ts'

export interface RemovedSentence {
  text: string
  figures: string[]
  reason: NonNullable<FigureCheck['reason']>
}

export interface GateResult {
  text: string
  sentences: BoundSentence[]
  /** The citations a kept sentence still points at, renumbered in order of first appearance. */
  citations: Citation[]
  /** Old marker number to new, for callers that keyed anything by the pre-gate numbering. */
  renumber: Map<number, number>
  removed: RemovedSentence[]
  /** Sentences that had no marker and gained the one text that carries all their figures. */
  inherited: number
}

/**
 * Applies the figure checks to the bound answer. `checks` come from
 * `verifyFigures` over `bound.sentences` in order; for a sentence bound to
 * no text they were run against every usable cited text, whose positions
 * map to citation indices through `markerOfText`. `candidates` are the
 * citations a sentence may inherit, in the same numbering as the bound
 * sentences (the binding's, when it kept the provider's numbers): a text
 * the binding dropped every marker to can still lend one here.
 */
export function gateFigures(
  bound: BindResult,
  checks: readonly FigureCheck[],
  markerOfText: readonly number[],
  candidates: readonly Citation[] = bound.citations,
): GateResult {
  const removed: RemovedSentence[] = []
  const removedIndices = new Set<number>()
  let inherited = 0
  const sentences = bound.sentences.map((sentence, i) => {
    const own = checks.filter((c) => c.sentence === sentence.text)
    if (own.length === 0) return sentence
    const failing = own.filter((c) => !c.supported)
    if (sentence.bound.length > 0) {
      if (failing.length === 0) return sentence
      removedIndices.add(i)
      removed.push({
        text: sentence.text,
        figures: figuresToName(failing),
        reason: dominantReason(failing),
      })
      return sentence
    }
    // No marker: the one text that carries every figure lends its marker.
    if (failing.length === 0) {
      const common = own
        .map((c) => new Set(c.supportedBy))
        .reduce<Set<number> | null>(
          (acc, set) => acc === null ? set : new Set([...acc].filter((n) => set.has(n))),
          null,
        )
      const position = common ? [...common].sort((a, b) => a - b)[0] : undefined
      const marker = position === undefined ? undefined : markerOfText[position]
      if (marker !== undefined) {
        inherited += 1
        return { ...sentence, bound: [marker] }
      }
    }
    removedIndices.add(i)
    removed.push({
      text: sentence.text,
      figures: figuresToName(failing.length > 0 ? failing : own),
      reason: failing.length > 0 ? dominantReason(failing) : 'absent',
    })
    return sentence
  })
  // A citation every sentence of which was removed leaves the answer with
  // it, and the rest are renumbered by first appearance so the markers, the
  // chips and "n cited" describe the gated text.
  const order: number[] = []
  sentences.forEach((s, i) => {
    if (removedIndices.has(i)) return
    for (const n of s.bound) if (!order.includes(n)) order.push(n)
  })
  const renumber = new Map(order.map((old, i) => [old, i + 1]))
  const renumbered = sentences.map((s) => ({
    ...s,
    bound: s.bound.map((n) => renumber.get(n)).filter((n): n is number => n !== undefined).sort((
      a,
      b,
    ) => a - b),
  }))
  const citations = order.map((old) => {
    const source = candidates.find((c) => c.index === old) ??
      bound.citations.find((c) => c.index === old)!
    return { ...source, index: renumber.get(old)! }
  })
  return {
    text: renderBound(bound.layout, renumbered, removedIndices),
    sentences: renumbered.filter((_, i) => !removedIndices.has(i)),
    citations,
    renumber,
    removed,
    inherited,
  }
}

/**
 * The figures worth naming for a removed sentence: its results, not the
 * timepoint that fell with them ("80%, 231" rather than "80%, 12 months,
 * 231"); the timepoints only when nothing else failed.
 */
function figuresToName(checks: readonly FigureCheck[]): string[] {
  const results = checks.filter((c) => !/(?:month|week|year|day|hour)s$/.test(c.figure))
  return (results.length > 0 ? results : checks).map((c) => c.figure)
}

function dominantReason(failing: readonly FigureCheck[]): RemovedSentence['reason'] {
  const order: RemovedSentence['reason'][] = ['entity', 'outcome', 'timepoint', 'terms', 'absent']
  for (const reason of order) if (failing.some((c) => c.reason === reason)) return reason
  return 'absent'
}

/** "12months" reads "12 months" in a note. */
function figureLabel(token: string): string {
  return token.replace(/(\d)((?:month|week|year|day|hour)s)$/, '$1 $2')
}

/**
 * The line that says what the gate removed and why, in the portal's voice,
 * or undefined when nothing was.
 */
export function removalNote(removed: readonly RemovedSentence[]): string | undefined {
  if (removed.length === 0) return undefined
  const figures = [...new Set(removed.flatMap((r) => r.figures))].map(figureLabel)
  const reasons = new Set(removed.map((r) => r.reason))
  const why: string[] = []
  if (reasons.has('entity')) {
    why.push('the cited passage never names the cohort, drug or study the sentence gave them to')
  }
  if (reasons.has('outcome') || reasons.has('timepoint')) {
    why.push('the cited passage carries them for a different outcome or follow-up')
  }
  if (reasons.has('terms') || reasons.has('absent')) {
    why.push('no cited passage carries them beside the claim')
  }
  const count = removed.length === 1 ? 'One sentence was' : `${removed.length} sentences were`
  return `*${count} removed from this answer: its figures (${figures.join(', ')}) could not be ` +
    `verified - ${why.join('; ')}. Ask about one paper to see the figures it reports.*`
}

// ---------------------------------------------------------------------------
// The effect size the passage carries when the answer stated none
// ---------------------------------------------------------------------------

/**
 * A question that asks whether one thing changes the risk or outcome of
 * another. A bare comparison ("perampanel versus brivaracetam retention")
 * is not one: its answer is two rates, and a ratio the paper carries for
 * something else would be noise beside them.
 */
export function asksForEffect(query: string): boolean {
  return /\b(?:risk|increase|increases|increased|reduce|reduces|reduced|associated|association|hazard|odds|effect|effects|improve|improves|protective|predict|predictor|predictors)\b/i
    .test(query)
}

/** Whether the answer already states a ratio with its interval. */
export function statesEffectSize(answer: string): boolean {
  return /\b(?:a?HR|a?OR|RR|IRR|hazard ratio|odds ratio|risk ratio|relative risk|rate ratio)\b[^.]{0,160}?\d+\.\d+/i
    .test(answer)
}

const EFFECT_SIZE =
  /((?:adjusted |crude |unadjusted |multivariable )?(?:hazard|odds|risk|rate|incidence rate) ratios?(?: \[a?[HOR]R\])?|\ba?(?:HR|OR|RR|IRR)\b)\s*(?:\(a?[HOR]R\))?\s*(?:of|=|:|was|were|is)?\s*[\[(]?\s*(\d+\.\d+)\s*[\])]?[^.]{0,25}?(?:95\s?%\s*(?:CI|confidence interval)\s*[:=]?\s*[\[(]?\s*\d+\.?\d*\s*(?:-|to)\s*\d+\.?\d*\s*[\])]?)(?:[,;]?\s*p\s*[=<>]\s*0?\.\d+)?/gi

export interface EffectSize {
  index: number
  /** The passage's own words, from the ratio to the interval (and p value when given). */
  statement: string
}

/**
 * The effect sizes with intervals the cited texts carry in a sentence that
 * names one of the question's terms or outcomes - the aHR that answers "does
 * X increase the risk of Y" when the answer paraphrased it away. At most
 * one per text, at most two in all, only when the answer states none.
 */
export function effectSizesFor(
  query: string,
  answer: string,
  texts: readonly { index: number; text: string }[],
  lexicon: readonly string[],
): EffectSize[] {
  if (!asksForEffect(query) || statesEffectSize(answer)) return []
  const lower = query.toLowerCase()
  const terms = lexicon.map((t) => t.toLowerCase()).filter((t) =>
    t.length >= 4 && lower.includes(t)
  )
  for (const m of query.matchAll(/\b[A-Z][A-Z0-9]{2,7}\b/g)) {
    if (!/^(?:EEG|MRI|PET|ASM|ASMS|RCT|ILAE|CI|HR|OR|RR)$/.test(m[0])) {
      terms.push(m[0].toLowerCase())
    }
  }
  const outcomes = outcomeFamilies(query)
  const out: EffectSize[] = []
  for (const { index, text } of texts) {
    const source = normaliseSource(text)
    for (const sentence of source.split(/(?<=[.!?])\s+(?=[A-Z0-9("])|\s¶\s/)) {
      if (sentence.length > 700) continue
      const sentenceLower = sentence.toLowerCase()
      const named = terms.some((t) => sentenceLower.includes(t)) ||
        (outcomes.length > 0 && outcomeFamilies(sentence).some((o) => outcomes.includes(o)))
      if (!named) continue
      const hit = new RegExp(EFFECT_SIZE.source, 'i').exec(sentence)
      if (!hit) continue
      const statement = hit[0].replace(/\s+/g, ' ').trim()
        .replace(
          /([^(\[]*)[)\]]$/,
          (m, before: string) => before.includes('(') || before.includes('[') ? m : before,
        )
      out.push({ index, statement })
      break
    }
    if (out.length >= 2) break
  }
  return out
}

/** The addendum line for effect sizes the answer left out. */
export function effectSizeNote(sizes: readonly EffectSize[]): string | undefined {
  if (sizes.length === 0) return undefined
  return `*Effect size in the cited passage: ${
    sizes.map((s) => `${s.statement} [${s.index}]`).join('; ')
  }.*`
}

// ---------------------------------------------------------------------------
// Study design first
// ---------------------------------------------------------------------------

/** Words that name a study design, for the first-citation check. */
export const DESIGN_WORD =
  /\b(?:randomi[sz]ed|trial|cohort|case-control|case series|case report|cross-sectional|survey|model(?:ling|ing)?|simulation|simulated|in silico|preclinical|animal|review|meta-analysis|pooled analysis|protocol|first-in-human|observational|retrospective|prospective)\b/i

/**
 * The design line that leads an answer when a cited paper is a modelling,
 * simulation or preclinical study and the first sentence citing it named
 * no design: its results are simulated or from the bench, and the reader
 * must know that before the finding. Undefined when every such source was
 * introduced properly, or none is of that kind.
 */
export function designLead(
  citations: readonly { index: number; title: string; kind?: string; text?: string }[],
  sentences: readonly BoundSentence[],
): string | undefined {
  const byDesign = new Map<string, { markers: number[]; caveat: string; plural: string }>()
  for (const citation of citations) {
    const design = nonClinicalDesign(citation)
    if (!design) continue
    const first = sentences.find((s) => s.bound.includes(citation.index))
    if (first && DESIGN_WORD.test(first.text)) continue
    const entry = byDesign.get(design.label) ??
      { markers: [], caveat: design.caveat, plural: design.plural }
    entry.markers.push(citation.index)
    byDesign.set(design.label, entry)
  }
  if (byDesign.size === 0) return undefined
  const lines = [...byDesign.entries()].map(([label, { markers, caveat, plural }]) =>
    markers.length === 1
      ? `[${markers[0]}] is ${label} - ${caveat}`
      : `${markers.map((m) => `[${m}]`).join(' and ')} are ${plural} - ${
        caveat.replace(/^its /, 'their ')
      }`
  )
  return `*Study design: ${lines.join('; ')}.*`
}

/** Whether a cited paper reports modelling or bench results rather than patients' outcomes. */
export function nonClinicalDesign(
  citation: { title: string; kind?: string; text?: string },
): { label: string; plural: string; caveat: string } | undefined {
  if (citation.kind === 'preclinical') {
    return {
      label: 'a preclinical study',
      plural: 'preclinical studies',
      caveat: 'its results come from animals, cells or tissue, not from patients',
    }
  }
  // The title names the design, or the paper's own opening pages do in the
  // strong forms `studyDesignOf` accepts; a data study that interpreted
  // its recordings "using a mathematical model" is not a modelling study.
  const modelling =
    /\b(?:in silico|simulation|simulated|computational|mathematical|dynamic(?:al)? network|network model|model(?:l)?ing study)\b/i
      .test(citation.title) ||
    (citation.text !== undefined && studyDesignOf(citation.text) === 'a modelling study')
  if (modelling) {
    return {
      label: 'a modelling study',
      plural: 'modelling studies',
      caveat: 'its results are simulated, not demonstrated in patients',
    }
  }
  return undefined
}
