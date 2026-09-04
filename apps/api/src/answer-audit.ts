/**
 * Post-answer grounding audit: figures in the answer must appear in the
 * cited material beside the claim's own terms, years must come from the
 * cited resources, drugs the answer calls contraindicated must be called
 * that by a cited passage, and drugs the cited sources flag must not be
 * silently dropped. Deterministic string checks over the extracted text of
 * the cited resources - no model in the loop - so the audit is itself
 * grounded. Numbers are only ever checked and marked, never rewritten.
 */

/**
 * One spelling for the ranges and decimals both sides write differently:
 * "21–45%", "21 to 45%" and "21-45%" become "21-45%"; ".5 mg" becomes
 * "0.5 mg". Applied to the answer and to the cited texts before any check.
 */
export function normaliseFigures(text: string): string {
  return text
    .replace(/(\d)\s*[‐‑‒–—−]\s*(\d)/g, '$1-$2')
    .replace(/(\d(?:\.\d+)?%?)\s+(?:to|through)\s+(\d)/g, '$1-$2')
    .replace(/(?<![\d.])\.(\d+)/g, '0.$1')
}

/** Numbers worth checking: percentages, decimals, doses; not citation markers, list numbers, years or labels. */
export function extractNumbers(answer: string): string[] {
  const cleaned = normaliseFigures(answer)
    // Both ends of a range carry the range's unit: "21-45%" states 21% and 45%.
    .replace(
      /(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(\s?(?:%|mg(?:\/kg)?(?:\/day)?))/g,
      '$1$3 and $2$3',
    )
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, ' ') // citation markers
    .replace(/^\s*\d+\.\s+/gm, ' ') // ordered-list numbers
    // Labels, not measurements: "Table 2", "Figure 3", "Patient 10", "reference 41".
    .replace(
      /\b(?:table|figure|fig\.?|patient|participant|reference|ref\.?|section|chapter|item|case|supplementary (?:table|figure|file|material))\s+S?\d+/gi,
      ' ',
    )
  const found = new Set<string>()
  for (
    const m of cleaned.matchAll(
      /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s?%|\s?mg(?:\/kg)?(?:\/day)?)?/g,
    )
  ) {
    const raw = m[1] ?? ''
    const unit = (m[2] ?? '').replace(/\s/g, '')
    const value = raw.replace(/,/g, '')
    if (/^(19|20)\d{2}$/.test(value) && !unit) continue // a year
    if (!unit && !value.includes('.') && Number(value) < 10) continue // small counts
    found.add(value + unit)
  }
  return [...found]
}

function normaliseText(text: string): string {
  return normaliseFigures(text).replace(/\s+/g, ' ').replace(/,(?=\d{3}\b)/g, '')
}

/**
 * The pattern a figure token ("6.42%", "1400mg", "0.54") must match in a
 * text: the whole number, and its unit when it has one - "21%" is not the
 * "21" of "21 patients". The number may also lead a range whose unit
 * follows the second number ("21-45%").
 */
export function figurePattern(token: string, flags = ''): RegExp {
  const value = token.replace(/%|mg.*$/, '')
  const unit = token.slice(value.length)
  const number = `(?<![\\d.])${value.replace('.', '\\.')}(?![\\d])`
  if (!unit) return new RegExp(number, flags)
  const unitPattern = unit === '%'
    ? '\\s?(?:%|percent|per cent)'
    : `\\s?${unit.replace('/', '\\/')}`
  return new RegExp(`${number}(?:${unitPattern}|-\\d+(?:\\.\\d+)?${unitPattern})`, flags)
}

/** Whether a figure token occurs, with its unit, in the text. */
export function figurePresent(token: string, haystack: string): boolean {
  return figurePattern(token).test(haystack)
}

/** Figures in the answer that appear in none of the cited texts. */
export function numbersMissing(answer: string, citedTexts: readonly string[]): string[] {
  const haystack = citedTexts.map(normaliseText).join('\n')
  return extractNumbers(answer).filter((token) => !figurePresent(token, haystack))
}

// ---------------------------------------------------------------------------
// Figures checked beside their claim's own terms
// ---------------------------------------------------------------------------

/** Words too generic to anchor a figure to its claim. */
const GENERIC = new Set([
  'about',
  'above',
  'achieved',
  'after',
  'among',
  'analysis',
  'approximately',
  'around',
  'associated',
  'average',
  'baseline',
  'between',
  'cases',
  'cohort',
  'compared',
  'control',
  'controls',
  'data',
  'during',
  'estimated',
  'evidence',
  'findings',
  'first',
  'follow',
  'found',
  'frequency',
  'group',
  'groups',
  'higher',
  'incidence',
  'included',
  'increase',
  'increased',
  'interval',
  'lower',
  'majority',
  'mean',
  'median',
  'months',
  'number',
  'observed',
  'occurred',
  'outcome',
  'outcomes',
  'overall',
  'participants',
  'patients',
  'percent',
  'period',
  'population',
  'prevalence',
  'proportion',
  'range',
  'rate',
  'rates',
  'ratio',
  'reduction',
  'remained',
  'reported',
  'respectively',
  'response',
  'result',
  'results',
  'risk',
  'sample',
  'showed',
  'significant',
  'studies',
  'study',
  'subjects',
  'their',
  'there',
  'these',
  'those',
  'total',
  'trial',
  'trials',
  'versus',
  'weeks',
  'which',
  'while',
  'within',
  'years',
])

/**
 * The terms a figure hangs on. Anchors are the specific names in the same
 * sentence - lexicon hits (drugs, genes), symbols and capitalised names
 * (an intervention such as LITT, a species, a register) - and when a
 * sentence has any, the figure must sit beside one of them. Words are the
 * fallback for a sentence with no names: any specific word of five letters
 * or more. All lower-cased.
 */
export function claimTerms(
  sentence: string,
  lexicon: readonly string[],
): { anchors: string[]; words: string[] } {
  const lower = sentence.toLowerCase()
  const anchors = new Set<string>()
  for (const term of lexicon) {
    const t = term.toLowerCase()
    if (t.length >= 4 && lower.includes(t)) anchors.add(t)
  }
  for (const m of sentence.matchAll(/\b[A-Z][A-Z0-9]{1,7}\b/g)) {
    if (
      !/^(PMC|DOI|EEG|MRI|PET|ASM|ASMS|RCT|ILAE|HR|CI|OR|RR|SD|IQR|AUC|FDA|USA|UK|HS|N|P)\d*$/.test(
        m[0],
      )
    ) {
      anchors.add(m[0].toLowerCase())
    }
  }
  for (
    const m of sentence.matchAll(/(?<=[^.!?\n]\s|[(,;]\s?)([A-Z][a-z]{3,}(?:-[A-Z][a-z]+)?)\b/g)
  ) {
    const word = m[1]!.toLowerCase()
    if (!GENERIC.has(word)) anchors.add(word)
  }
  const words = new Set<string>()
  for (const m of lower.matchAll(/\b[a-z][a-z-]{4,}\b/g)) {
    const word = m[0]
    if (!GENERIC.has(word)) words.add(word.replace(/s$/, ''))
  }
  return { anchors: [...anchors], words: [...words] }
}

export interface FigureCheck {
  figure: string
  sentence: string
  supported: boolean
}

/**
 * Checks every figure in each sentence against the texts that sentence is
 * bound to: the figure must occur within a window that also carries at
 * least one of the claim's own terms, so a number copied from a passage
 * about a different intervention, population or study is caught even when
 * the bare number exists somewhere in the paper. A sentence bound to no
 * text is checked against every cited text under the same rule.
 */
export function verifyFigures(
  sentences: readonly { text: string; texts: readonly string[] }[],
  allTexts: readonly string[],
  lexicon: readonly string[] = [],
): FigureCheck[] {
  const out: FigureCheck[] = []
  const prepared = new Map<string, string>()
  const norm = (t: string) => {
    let v = prepared.get(t)
    if (v === undefined) {
      v = normaliseText(t).toLowerCase()
      prepared.set(t, v)
    }
    return v
  }
  for (const sentence of sentences) {
    const figures = extractNumbers(sentence.text)
    if (figures.length === 0) continue
    const { anchors, words } = claimTerms(sentence.text, lexicon)
    const terms = anchors.length > 0 ? anchors : words
    // One name beside the figure is enough; without names, two of the
    // claim's words must be there - a lone "seizure" next to a "21%" in an
    // epilepsy paper says nothing about which 21% that is.
    const needed = anchors.length > 0 ? 1 : Math.min(2, terms.length)
    const texts = (sentence.texts.length > 0 ? sentence.texts : allTexts).map(norm)
    for (const figure of figures) {
      const re = figurePattern(figure, 'g')
      let supported = false
      for (const text of texts) {
        let m: RegExpExecArray | null
        while (!supported && (m = re.exec(text)) !== null) {
          if (terms.length === 0) {
            supported = true
            break
          }
          const window = claimWindow(text, m.index)
          if (terms.filter((term) => window.includes(term)).length >= needed) supported = true
        }
        re.lastIndex = 0
        if (supported) break
      }
      out.push({ figure, sentence: sentence.text, supported })
    }
  }
  return out
}

/**
 * The passage a figure belongs to: its own sentence and the one before it,
 * bounded so a long paragraph cannot lend it a name from far away. The
 * sentence after is excluded on purpose - "76% at 12 months. ... 68% for
 * LITT" must not let LITT claim the 76%.
 */
export function claimWindow(text: string, at: number): string {
  const floor = Math.max(0, at - 350)
  const before = text.slice(floor, at)
  const boundaries = [...before.matchAll(/[.!?;]\s+(?=[a-z0-9("])/g)].map((m) =>
    m.index + m[0].length
  )
  const start = boundaries.length >= 2
    ? boundaries[boundaries.length - 2]!
    : boundaries.length === 1 && at - floor < 350
    ? 0
    : (boundaries[0] ?? 0)
  const after = text.slice(at, at + 200)
  const endMatch = /[.!?;](?:\s|$)/.exec(after)
  const end = endMatch ? at + endMatch.index + 1 : at + after.length
  return text.slice(floor + start, end)
}

// ---------------------------------------------------------------------------
// Years
// ---------------------------------------------------------------------------

/** Four-digit years the answer states, outside citation markers. */
export function yearsInAnswer(answer: string): string[] {
  const cleaned = answer.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, ' ')
  const years = new Set<string>()
  for (const m of cleaned.matchAll(/(?<![\d.\-/])((?:19|20)\d{2})(?![\d.\-/%])/g)) {
    years.add(m[1]!)
  }
  return [...years]
}

/**
 * Years the answer states that neither the cited resources' metadata nor
 * their texts carry - the "a 2025 study" that was published in 2021.
 */
export function yearsUnsupported(
  answer: string,
  metadataYears: readonly string[],
  citedTexts: readonly string[],
): string[] {
  const known = new Set(metadataYears.map((y) => y.slice(0, 4)))
  const haystack = citedTexts.join('\n')
  return yearsInAnswer(answer).filter((year) =>
    !known.has(year) && !new RegExp(`(?<!\\d)${year}(?!\\d)`).test(haystack)
  )
}

// ---------------------------------------------------------------------------
// Contraindications, both directions
// ---------------------------------------------------------------------------

const CONTRA =
  /contraindicat|should be avoided|to be avoided|must be avoided|avoid(?:ed|ing)?\b|worsen|aggravat|exacerbat|not recommended/i

/** Drugs named within reach of a contraindication phrase in a cited text. */
export function drugsFlaggedInSources(
  texts: readonly { index: number; text: string }[],
  lexicon: readonly string[],
): { drug: string; index: number }[] {
  const out = new Map<string, number>()
  for (const { index, text } of texts) {
    // Same sentence only: a drug merely near an "avoid" elsewhere is not a
    // contraindication statement about that drug.
    const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.;!?])\s+/)
    for (const sentence of sentences) {
      if (sentence.length > 400) continue
      const lower = sentence.toLowerCase()
      const hit = new RegExp(CONTRA.source, 'i').exec(lower)
      if (!hit) continue
      // A sentence reporting a good response ("reduction in seizures with
      // lamotrigine or lacosamide") is not a contraindication statement.
      if (/reduc|improv|effective|efficac|benefit|respon(?:se|ded)|seizure[- ]free/.test(lower)) {
        continue
      }
      const at = hit.index
      for (const term of lexicon) {
        const t = term.toLowerCase()
        if (t.length < 5 || out.has(t)) continue
        const where = lower.indexOf(t)
        if (where !== -1 && Math.abs(where - at) <= 90) out.set(t, index)
      }
    }
  }
  return [...out.entries()].map(([drug, index]) => ({ drug, index }))
}

/** Flagged drugs the answer never mentions. */
export function drugsMissingFromAnswer(
  answer: string,
  flagged: readonly { drug: string; index: number }[],
): { drug: string; index: number }[] {
  const lower = answer.toLowerCase()
  return flagged.filter((f) => !lower.includes(f.drug))
}

/** A drug (or drug class) the answer calls contraindicated, and the sentence saying so. */
export interface ContraindicationClaim {
  drug: string
  sentence: string
}

/** Drug classes a clinical answer can call contraindicated without naming a drug. */
const DRUG_CLASS = /\b(?:sodium[- ]channel[- ]block\w*|barbiturate\w*|benzodiazepine\w*)\b/gi

/** The drugs and classes each sentence of the answer calls contraindicated or to be avoided. */
export function contraindicationClaims(
  answer: string,
  lexicon: readonly string[],
): ContraindicationClaim[] {
  const out: ContraindicationClaim[] = []
  const plain = answer.replace(/\s*\[\d{1,3}\]/g, '')
  for (const line of plain.split('\n')) {
    for (const sentence of line.split(/(?<=[.!?])\s+(?=[A-Z*(])/)) {
      if (!CONTRA.test(sentence)) continue
      // A negation or a hedge is not a claim: "not contraindicated", "the
      // sources do not explicitly state that X is contraindicated".
      if (
        /\b(?:not|no|never)\s+(?:be\s+|considered\s+)?contraindicated|\b(?:do|does|did)\s+not\s+(?:\w+\s+)?(?:state|report|support|mention|say|indicate|confirm|establish|recommend|list|describe|specify|address|provide)\b|\bno (?:evidence|source|study|data)\b/i
          .test(sentence)
      ) {
        continue
      }
      const lower = sentence.toLowerCase()
      const drugs = new Set<string>()
      for (const term of lexicon) {
        const t = term.toLowerCase()
        if (t.length >= 5 && lower.includes(t)) drugs.add(t)
      }
      // A class is the claim only when no drug is named: "vigabatrin is
      // contraindicated as it is a sodium channel blocker" is a claim about
      // vigabatrin, and the class must not vouch for it.
      if (drugs.size === 0) {
        for (const m of sentence.matchAll(DRUG_CLASS)) drugs.add(m[0].toLowerCase())
      }
      for (const drug of drugs) out.push({ drug, sentence: sentence.trim() })
    }
  }
  return out
}

/** Whether a cited text calls the drug contraindicated (or to be avoided, or seizure-worsening). */
export function contraindicationSupported(drug: string, texts: readonly string[]): boolean {
  // "sodium channel-blocking" and "sodium channel blockers" are one class.
  const plain = drug.toLowerCase().replace(/-/g, ' ')
  const stemmed = plain.replace(/s$/, '').slice(0, Math.max(5, plain.length - 3))
  for (const text of texts) {
    const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.;!?])\s+/)
    for (const sentence of sentences) {
      if (sentence.length > 500) continue
      const lower = sentence.toLowerCase().replace(/-/g, ' ')
      const where = lower.indexOf(stemmed)
      if (where === -1) continue
      const hit = new RegExp(CONTRA.source, 'i').exec(lower)
      if (!hit) continue
      if (/reduc|improv|effective|efficac|benefit|respon(?:se|ded)|seizure[- ]free/.test(lower)) {
        continue
      }
      if (Math.abs(where - hit.index) <= 150) return true
    }
  }
  return false
}

/**
 * The inverse check for the safety variant: every drug the answer calls
 * contraindicated must be called that by a cited passage. A sentence none of
 * whose drugs are supported is removed and replaced with a plain statement
 * that the sources do not say so; a sentence with some support keeps its
 * text and gains the statement for the drugs that lack it.
 */
export function stripUnsupportedContraindications(
  answer: string,
  texts: readonly string[],
  lexicon: readonly string[],
): { text: string; unsupported: string[] } {
  const claims = contraindicationClaims(answer, lexicon)
  if (claims.length === 0) return { text: answer, unsupported: [] }
  const bySentence = new Map<string, string[]>()
  for (const claim of claims) {
    const list = bySentence.get(claim.sentence) ?? []
    list.push(claim.drug)
    bySentence.set(claim.sentence, list)
  }
  const unsupported = new Set<string>()
  let text = answer
  for (const [sentence, drugs] of bySentence) {
    const lacking = drugs.filter((d) => !contraindicationSupported(d, texts))
    if (lacking.length === 0) continue
    for (const d of lacking) unsupported.add(d)
    const list = lacking.join(lacking.length === 2 ? ' or ' : ', ')
    const note = `*The cited sources do not state that ${list} ${
      lacking.length > 1 ? 'are' : 'is'
    } contraindicated or should be avoided here.*`
    // Match the sentence as it stands in the answer, markers included.
    const pattern = new RegExp(
      sentence.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(
        '(?:\\s*\\[\\d{1,3}\\])*\\s+',
      ).replace(/\\\.$/, '(?:\\s*\\[\\d{1,3}\\])*\\.') + '(?:\\s*\\[\\d{1,3}\\])*',
    )
    text = lacking.length === drugs.length
      ? text.replace(pattern, note)
      : text.replace(pattern, (m) => `${m} ${note}`)
  }
  return { text, unsupported: [...unsupported] }
}

// ---------------------------------------------------------------------------
// The addendum
// ---------------------------------------------------------------------------

/** The Markdown addendum appended to an answer, or '' when nothing to add. */
export function auditAddendum(
  input: {
    missingDrugs: { drug: string; index: number }[]
    missingNumbers: string[]
    missingYears?: string[]
  },
): string {
  const parts: string[] = []
  if (input.missingDrugs.length > 0) {
    const list = input.missingDrugs.map((d) => `${d.drug} [${d.index}]`).join(', ')
    parts.push(
      `**The cited sources also discuss ${list} in the context of contraindication or seizure worsening.** ` +
        'Check those passages before relying on the list above.',
    )
  }
  if (input.missingNumbers.length > 0) {
    parts.push(
      `*Figures in this answer that do not appear beside their claim in the cited passages: ${
        input.missingNumbers.join(', ')
      }. Verify against the sources before relying on them.*`,
    )
  }
  if (input.missingYears && input.missingYears.length > 0) {
    parts.push(
      `*Years stated in this answer that the cited resources do not carry: ${
        input.missingYears.join(', ')
      }. Check the publication year on each source.*`,
    )
  }
  return parts.length > 0 ? `\n\n${parts.join('\n\n')}` : ''
}
