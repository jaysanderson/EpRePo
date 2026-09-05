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
  return normaliseGlyphs(text)
    .replace(/([\d%])\s*[‐‑‒–—−]\s*(\d)/g, '$1-$2')
    .replace(/(\d(?:\.\d+)?%?)\s+(?:to|through)\s+(\d)/g, '$1-$2')
    .replace(/(?<![\d.])\.(\d+)/g, '0.$1')
}

/**
 * The glyphs a PDF extraction writes where the paper has a decimal point,
 * a plus-minus sign or a thin space (docs/persona-reports/dsouza-loop4.md
 * D4-10): "1¢66 § 0¢52 h" is "1.66 ± 0.52 h", "1·66" (a Lancet-style
 * middle dot) is "1.66", and a thin, narrow, figure or non-breaking space
 * between digits or before a unit is an ordinary space. Applied to the
 * answer and to every source before any figure is read or quoted.
 */
export function normaliseGlyphs(text: string): string {
  return text
    .replace(/[    ]/g, ' ')
    .replace(/(\d)[¢·•](\d)/g, '$1.$2')
    .replace(/§/g, '±')
}

const UNITS_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
}
const TENS_WORDS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}
const NUMBER_WORD = new RegExp(
  `\\b(${Object.keys(TENS_WORDS).join('|')})(?:[\\s-]{1,3}(${
    Object.keys(UNITS_WORDS).join('|')
  }))?\\b|\\b(${Object.keys(UNITS_WORDS).join('|')})\\b`,
  'gi',
)

/**
 * Number words as digits: "Thirteen participants" reads "13 participants",
 * "thirty-one subjects" reads "31 subjects". A paper opens a sentence with
 * the word where the answer states the digits; without this the audit
 * flags a figure the paper carries.
 */
export function numberWordsToDigits(text: string): string {
  return text.replace(NUMBER_WORD, (_m, tens?: string, unit?: string, lone?: string) => {
    if (lone) return String(UNITS_WORDS[lone.toLowerCase()])
    const value = TENS_WORDS[tens!.toLowerCase()]! + (unit ? UNITS_WORDS[unit.toLowerCase()]! : 0)
    return String(value)
  })
}

/** Paragraph boundary marker kept through whitespace collapsing, so a claim window never crosses one. */
export const PARAGRAPH_MARK = '¶'

/**
 * A cited text prepared for figure matching: figures and ranges in one
 * spelling, number words as digits, thousands separators removed, the
 * "38 (79)" and "937 (52)" of a table cell read as "38 (79%)", and blank
 * lines kept as a paragraph mark so a window stops at the paragraph.
 * Whitespace is otherwise collapsed. Applied to every source before any
 * check; the answer only gets `normaliseFigures`.
 */
export function normaliseSource(text: string): string {
  return numberWordsToDigits(normaliseFigures(text))
    // A blank line the extraction put mid-sentence ("just \n\n over a
    // third") is not a paragraph break: the next line opens in lower case.
    .replace(/\n\s*\n(?=[ \t]*[a-z])/g, ' ')
    .replace(/\n\s*\n/g, ` ${PARAGRAPH_MARK} `)
    .replace(/\s+/g, ' ')
    // A word broken across a PDF line ("pri- mary", "com- mercial") is one
    // word; a compound written "two- arm" is matched hyphen-insensitively.
    .replace(/([a-z]{2,})- (?=[a-z]{2,})/g, '$1')
    .replace(/,(?=\d{3}\b)/g, '')
    // A thousands group set off by a space or a thin space ("82 723", "1 644")
    // is one number: the extraction writes "82 723" where the answer writes
    // "82,723", and the audit must find it (D3-02).
    .replace(/(?<![\d.,])(\d{1,3})[ \u00a0\u2009\u202f](\d{3})(?![\d])/g, '$1$2')
    // A count with its share in brackets is a table cell or a results
    // sentence: "29 (48)" and "154 (67)" state 48% and 67%. A share over
    // 100 or a decimal count is neither.
    .replace(/(?<![\d.])(\d{1,5}) \((\d{1,2}(?:\.\d+)?)\)(?!%)/g, '$1 ($2%)')
}

/** Numbers worth checking: percentages, decimals, doses; not citation markers, list numbers, years, labels or clock times. */
export function extractNumbers(answer: string): string[] {
  const cleaned = normaliseFigures(numberWordsToDigits(answer))
    // Both ends of a range carry the range's unit: "21-45%" states 21% and 45%.
    .replace(
      /(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(\s?(?:%|mg(?:\/kg)?(?:\/day)?))/g,
      '$1$3 and $2$3',
    )
    // An age in years is a bare figure: a paper's table writes "45 (23–71)"
    // under a "years" column heading.
    .replace(/\b(aged?|years old)\b([^.]{0,40}?)(\d+(?:\.\d+)?)\s?years\b/gi, '$1$2$3')
    // A range of ages or durations ("range 23-71 years") is two bare
    // figures: a paper's table writes "45 (23–71)" without the unit.
    .replace(
      /(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\s?(?:years?|months?|weeks?|days?|hours?)\b/g,
      '$1 and $2',
    )
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, ' ') // citation markers
    .replace(/^\s*\d+\.\s+/gm, ' ') // ordered-list numbers
    // Labels, not measurements: "Table 2", "Figure 3", "Patient 10", "reference 41",
    // "Week 52", "grade 3", "phase 2".
    .replace(
      /\b(?:table|figure|fig\.?|patient|participant|reference|ref\.?|section|chapter|item|case|week|day|visit|grade|stage|phase|type|cluster|class|arm|supplementary (?:table|figure|file|material))s?\s+S?\d+(?:\s*,\s*\d+)*(?:,?\s*(?:and|or)\s+\d+)?/gi,
      ' ',
    )
    // Clock times are checked as their own tokens below, never as bare numbers.
    .replace(/\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)(?![a-z])/gi, ' ')
    .replace(/\b\d{1,2}\s?(?:noon|midnight)\b/gi, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
  const found = new Set<string>(clockTimes(answer))
  for (
    const m of cleaned.matchAll(
      /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s?%|\s?mg(?:\/kg)?(?:\/day)?|[\s-]?(?:months?|weeks?|years?|days?|hours?|hrs?|h)\b)?/g,
    )
  ) {
    const raw = m[1] ?? ''
    const unit = (m[2] ?? '').replace(/[\s-]/g, '')
    const value = raw.replace(/,/g, '')
    if (/^(19|20)\d{2}$/.test(value) && !unit) continue // a year
    if (!unit && !value.includes('.') && Number(value) < 10) continue // small counts
    // A duration is a timepoint, not a result: "12 months" is checked as the
    // unit-bearing token "12months" (never the bare 12 of a table cell), and
    // counts under ten are as small as bare counts.
    found.add(value + normaliseUnit(unit))
  }
  return [...found]
}

/**
 * Clock times in a text as tokens: "11 p.m." and "11pm" read "11pm", "12
 * noon" reads "12noon", "08:30" reads "08:30". A sentence that places a
 * peak "between 11 p.m. and 7 a.m." states figures the reader will repeat,
 * so they count for the marker rule (D3-20) - and the matcher checks them
 * as times, never as the bare 11 of a table cell.
 */
export function clockTimes(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/\b(\d{1,2})(?::(\d{2}))?\s?(a|p)\.?m\.?(?![a-z])/gi)) {
    out.add(`${Number(m[1])}${m[2] ? `:${m[2]}` : ''}${m[3]!.toLowerCase()}m`)
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s?(noon|midnight)\b/gi)) {
    out.add(`${Number(m[1])}${m[2]!.toLowerCase()}`)
  }
  return [...out]
}

/** Whether a figure token is a clock time from `clockTimes`. */
export function isClockToken(token: string): boolean {
  return /^\d{1,2}(?::\d{2})?(?:[ap]m|noon|midnight)$/.test(token)
}

/** Plural, singular and abbreviated time units are one token: "12months" for "12 months" and "12-month", "5hours" for "5 h". */
function normaliseUnit(unit: string): string {
  const time = /^(month|week|year|day|hour)s?$/.exec(unit)
  if (time) return `${time[1]}s`
  if (/^hrs?$|^h$/.test(unit)) return 'hours'
  return unit
}

function normaliseText(text: string): string {
  return normaliseSource(text)
}

/**
 * The pattern a figure token ("6.42%", "1400mg", "0.54") must match in a
 * text: the whole number, and its unit when it has one - "21%" is not the
 * "21" of "21 patients". The number may also lead a range whose unit
 * follows the second number ("21-45%").
 */
export function figurePattern(token: string, flags = ''): RegExp {
  if (isClockToken(token)) {
    const m = /^(\d{1,2})(?::(\d{2}))?([ap]m|noon|midnight)$/.exec(token)!
    const hour = `(?<![\\d.])0?${m[1]}${m[2] ? `:${m[2]}` : '(?::00)?'}`
    const meridiem = m[3] === 'noon' || m[3] === 'midnight'
      ? `\\s?${m[3]}`
      : `\\s?${m[3]![0]}\\.?m\\.?(?![a-z])`
    return new RegExp(`${hour}${meridiem}`, flags + 'i')
  }
  const value = token.replace(/%|mg.*$|(?:month|week|year|day|hour)s$/, '')
  const unit = token.slice(value.length)
  // A count of four digits or more may carry a thousands separator in a
  // text that was not normalised ("2,709", "2 709"): the separator is
  // optional before every group of three (D4-01).
  const digits = value.includes('.') ? value.replace('.', '\\.') : value.replace(
    /(\d)(?=(?:\d{3})+$)/g,
    '$1[, ]?',
  )
  const number = `(?<![\\d.])${digits}(?![\\d])`
  if (!unit) return new RegExp(number, flags)
  const time = /^(month|week|year|day|hour)s$/.exec(unit)
  const unitPattern = unit === '%'
    ? '\\s?(?:%|percent|per cent)'
    : time
    ? `[\\s-]?(?:${time[1]}s?|${TIME_ABBREVIATIONS[time[1]!]})\\b`
    : `\\s?${unit.replace('/', '\\/')}`
  // A share the answer states as a percentage is stated by the paper as a
  // proportion: "F2 is 0.37" carries "37%" (D4-19). The proportion form is
  // an alternative for a percentage under 100, never a decimal unit of
  // its own.
  const proportion = unit === '%' ? proportionForm(value) : undefined
  // A time unit may follow its spread or interval: "1.66 ± 0.52 h", "414
  // (IQR 256, 967) days" (D4-10).
  const spread = time
    ? '(?:\\s?\\(?±\\s?\\d+(?:\\.\\d+)?\\)?|\\s?\\((?:IQR|range|SD|95% CI)[^)]{0,30}\\))?'
    : ''
  return new RegExp(
    `(?:${number}${spread}(?:${unitPattern}|-\\d+(?:\\.\\d+)?${unitPattern})${
      proportion ? `|${proportion}` : ''
    })`,
    flags,
  )
}

/** "37" as the proportion "0.37" (or ".37", "0.370"), "37.5" as "0.375"; undefined at or over 100. */
function proportionForm(percent: string): string | undefined {
  const n = Number(percent)
  if (!Number.isFinite(n) || n >= 100 || n <= 0) return undefined
  const fraction = (n / 100).toFixed(4).replace(/^0\./, '').replace(/0+$/, '')
  if (!fraction) return undefined
  // The decimal stands for a share only beside a fraction cue: "F2 is
  // 0.37", "the proportion was 0.37", "0.37 of discharges"; a kappa of
  // 0.80 or a hazard ratio of 0.37 is not 80% or 37% of anything.
  const tail =
    `0?\\.${fraction}0*(?![\\d%])(?!\\s?(?:mg|mmol|ml|mm|ms|h\\b|hours?|hrs?|years?|months?|weeks?|days?))`
  return `(?:(?<=\\b(?:proportion|fraction|share|f\\d)\\b[^.¶]{0,40})(?<![\\d.])${tail}|(?<![\\d.])${tail}(?=[^.¶]{0,60}\\bof\\b))`
}

/** The short forms a paper writes a time unit in: "48 h", "6 mo", "2 yr", "4 wk", "30 d". */
const TIME_ABBREVIATIONS: Record<string, string> = {
  hour: 'hrs?|h',
  day: 'd',
  week: 'wks?',
  month: 'mos?',
  year: 'yrs?|y',
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
 * (an intervention such as LITT, a species, a register, a scale such as
 * mRS) - and when a sentence has any, the figure must sit beside one of
 * them. Words are the fallback for a sentence with no names: any specific
 * word of five letters or more. Content words are every word of four
 * letters or more that is not a stopword, for a sentence whose words are
 * all generic ("the sample size is 220 participants, 110 per group").
 * All lower-cased.
 */
export function claimTerms(
  sentence: string,
  lexicon: readonly string[],
): { anchors: string[]; words: string[]; content: string[] } {
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
  // A mixed-case symbol: a scale (mRS), an adjusted ratio (aHR), a method (tDCS).
  for (const m of sentence.matchAll(/\b[a-z][A-Z]{2,}\d?\b/g)) {
    if (!/^a(?:HR|OR|RR)$/.test(m[0])) anchors.add(m[0].toLowerCase())
  }
  for (
    const m of sentence.matchAll(/(?<=[^.!?\n]\s|[(,;]\s?)([A-Z][a-z]{3,}(?:-[A-Z][a-z]+)?)\b/g)
  ) {
    const word = m[1]!.toLowerCase()
    if (!GENERIC.has(word)) anchors.add(word)
  }
  const words = new Set<string>()
  const content = new Set<string>()
  for (const m of lower.matchAll(/\b[a-z][a-z-]{3,}\b/g)) {
    const word = m[0]
    if (STOP.has(word)) continue
    content.add(word.replace(/s$/, ''))
    if (word.length >= 5 && !GENERIC.has(word)) words.add(word.replace(/s$/, ''))
  }
  return { anchors: [...anchors], words: [...words], content: [...content] }
}

/** Function words that never carry a claim, for the content-word fallback. */
const STOP = new Set([
  'that',
  'this',
  'with',
  'from',
  'were',
  'have',
  'been',
  'they',
  'their',
  'which',
  'when',
  'than',
  'then',
  'each',
  'into',
  'also',
  'only',
  'more',
  'most',
  'such',
  'some',
  'over',
  'both',
  'these',
  'those',
  'there',
  'where',
  'while',
  'after',
  'before',
  'about',
  'among',
  'between',
  'within',
  'during',
  'other',
  'being',
  'however',
  'therefore',
  'respectively',
  'approximately',
  'cited',
  'sources',
  'source',
  'indicate',
  'indicates',
  'reported',
  'report',
  'reports',
  'found',
  'showed',
  'shown',
  'suggest',
  'suggests',
  'study',
  'studies',
])

export interface FigureCheck {
  figure: string
  sentence: string
  supported: boolean
  /** Positions, in the texts the sentence was checked against, of the texts that carry the figure beside its claim. */
  supportedBy: number[]
  /** The sentence of the first supporting text that carries the figure, for the population check. */
  passage?: string
  /**
   * Why the figure failed, when it did: the number is absent from every
   * text, or present only beside none of the claim's terms, or beside a
   * different outcome or timepoint, or the sentence names a cohort, drug or
   * study the text never mentions.
   */
  reason?:
    | 'absent'
    | 'terms'
    | 'outcome'
    | 'timepoint'
    | 'entity'
    | 'cohort'
    | 'pvalue'
    | 'secondhand'
}

// ---------------------------------------------------------------------------
// Abbreviations a paper defines for the names a claim hangs on
// ---------------------------------------------------------------------------

/**
 * The "perampanel (PER)" and "antiseizure medication (ASM)" definitions in a
 * text, as pairs of the defined phrase (lower-cased) and its abbreviation
 * (as written, upper-case). A paper states its abbreviation once and uses
 * it everywhere after, so the figure's own sentence reads "retention on PER
 * treatment" while the claim names perampanel; without the pair the figure
 * looks unsupported. Only a real acronym qualifies: its first letter opens
 * the phrase and its letters occur in the phrase in order.
 */
export function abbreviationPairs(text: string): { phrase: string; abbr: string }[] {
  const out: { phrase: string; abbr: string }[] = []
  const seen = new Set<string>()
  for (
    const m of text.matchAll(
      /((?:[A-Za-z][a-z-]{2,}\s){0,3}[A-Za-z][a-z-]{2,})\s\(([A-Z][A-Z0-9]{1,5})s?\)/g,
    )
  ) {
    const words = m[1]!.toLowerCase().split(/\s+/)
    const abbr = m[2]!
    if (seen.has(abbr)) continue
    const letters = abbr.toLowerCase().replace(/[0-9]/g, '')
    // The shortest word suffix the abbreviation is an acronym of.
    for (let k = 1; k <= words.length; k++) {
      const phrase = words.slice(words.length - k).join(' ')
      if (phrase[0] !== letters[0]) continue
      if (!isSubsequence(letters, phrase.replace(/[\s-]/g, ''))) continue
      out.push({ phrase, abbr })
      seen.add(abbr)
      break
    }
  }
  return out
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0
  for (const ch of haystack) {
    if (ch === needle[i]) i++
    if (i === needle.length) return true
  }
  return i === needle.length
}

/**
 * The forms a claim term may take in a text: the term itself and the phrase
 * an abbreviation stands for (lower-case, matched in the lower-cased
 * window) and the abbreviation the text defines for the term (upper-case,
 * matched case-sensitively in the original window - "PER" is never the
 * "per" of "per cent").
 */
export function termForms(
  term: string,
  pairs: readonly { phrase: string; abbr: string }[],
): RegExp[] {
  const forms: RegExp[] = [new RegExp(escapeRegExp(term).replace(/-/g, '-?\\s?'))]
  // A paper's table writes "Female" where the answer says "women".
  if (term === 'women' || term === 'woman') forms.push(/\bfemales?\b/)
  if (term === 'men' || term === 'man') forms.push(/(?<!fe)\bmales?\b/)
  for (const { phrase, abbr } of pairs) {
    if (phrase === term || phrase.endsWith(` ${term}`) || phrase.split(' ')[0] === term) {
      forms.push(new RegExp(`\\b${escapeRegExp(abbr)}s?\\b`))
    }
    if (abbr.toLowerCase() === term) {
      for (const word of phrase.split(' ')) {
        if (word.length >= 4 && !GENERIC.has(word)) forms.push(new RegExp(escapeRegExp(word)))
      }
    }
  }
  return forms
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Outcomes and timepoints: a figure beside a different outcome or a
// different follow-up is a figure about something else
// ---------------------------------------------------------------------------

/** Outcome families, each matched in the lower-cased sentence or window. */
const OUTCOME_FAMILIES: [string, RegExp][] = [
  ['relapse', /\brelaps/],
  ['retention', /\bretention\b|\bretained\b/],
  ['seizure freedom', /\bseizure[- ]free|\bremission\b/],
  ['mortality', /\bmortality\b|\bdeaths?\b|\bdied\b|\bsudep\b|\bfatal/],
  ['discontinuation', /\bdiscontinu|\bwithdraw/],
  [
    'response',
    /\brespon(?:se|der)|50\s?%\s+(?:seizure\s+)?reduction|reduction (?:of|in) seizure frequency/,
  ],
  ['adverse events', /\badverse (?:event|effect|reaction)|\btolerab|\bside[- ]effect|\bteaes?\b/],
  ['functional outcome', /\bmrs\b|\bmodified rankin|\bfunctional outcome|\bdisabilit/],
  ['drug resistance', /\bdrug[- ]resist|\bdre\b|\brefractor|\bpharmacoresist/],
  ['recurrence', /\brecurren/],
  ['incidence', /\bincidence\b/],
  ['prevalence', /\bprevalence\b/],
  ['survival', /\bsurviv/],
  ['quality of life', /\bquality of life\b|\bqol/],
]

/** The outcome families a sentence or window names. */
export function outcomeFamilies(text: string): string[] {
  const lower = text.toLowerCase()
  return OUTCOME_FAMILIES.filter(([, re]) => re.test(lower)).map(([name]) => name)
}

const TIMEPOINT =
  /(?<![\d.])(\d+(?:\.\d+)?)[\s-]?(months?|mos?|weeks?|wks?|years?|yrs?|y|days?|d)\b(?!\s*(?:of age|old))/g

/** Follow-up timepoints in a text, in months: "12 months", "1-year", "52 weeks", "700 days" (23). */
export function timepointsInMonths(text: string): number[] {
  const out: number[] = []
  const lower = text.toLowerCase()
  for (const m of lower.matchAll(TIMEPOINT)) {
    // A median or mean duration ("a median of 414 days", "mean retention
    // time 18.7 months") is a result, not the follow-up it was measured at.
    const before = lower.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0)
    if (
      /\b(?:median|mean|average)\b(?:\s+(?!at\b|follow)[a-z-]+){0,3}\s*(?:[\d.,]+\s*(?:\([^)]{0,30}\))?\s*)?$/
        .test(before)
    ) {
      continue
    }
    const value = Number(m[1])
    const unit = m[2]!
    const months = /^mo/.test(unit)
      ? value
      : /^w/.test(unit)
      ? value * 7 / 30.44
      : /^y/.test(unit)
      ? value * 12
      : value / 30.44
    // Hours-scale and decade-scale durations are not follow-up timepoints.
    if (months >= 0.9 && months <= 240) out.push(months)
  }
  return out
}

function sameTimepoint(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.5 + 0.08 * Math.max(a, b)
}

/**
 * Whether a window's timepoints contradict a sentence's: both name one and
 * none agree. A window naming none, or a sentence naming none, says
 * nothing either way.
 */
export function timepointConflict(sentence: readonly number[], window: string): boolean {
  if (sentence.length === 0) return false
  const found = timepointsInMonths(window)
  if (found.length === 0) return false
  return !sentence.some((s) => found.some((w) => sameTimepoint(s, w)))
}

/**
 * Whether a window's outcome families contradict a sentence's: the window
 * names outcomes and none of them is one the sentence names. "DRE occurred
 * in 31%" is not a relapse rate.
 */
export function outcomeConflict(sentence: readonly string[], window: string): boolean {
  if (sentence.length === 0) return false
  const found = outcomeFamilies(window)
  if (found.length === 0) return false
  return !sentence.some((s) => found.includes(s))
}

/** Whether a figure token is a follow-up timepoint rather than a result. */
function isTimepointFigure(figure: string): boolean {
  return /(?:month|week|year|day)s$/.test(figure)
}

/**
 * Whether the sentence states the figure as a sample or subgroup size -
 * "n = 605", "605 patients", "(2698/4201)" - rather than as a result. A
 * count is placed by its noun, not by an outcome: the paper's "included
 * 605 patients with psychiatric comorbidity" sits in a methods paragraph
 * that names no retention, and that is no contradiction (D3-02).
 */
export function isSampleSizeFigure(figure: string, normalisedSentence: string): boolean {
  if (/%|\.|mg|[a-z]/.test(figure)) return false
  const n = figure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `\\bn\\s*=\\s*${n}(?![\\d])|(?<![\\d.])${n}\\s+(?:patients|participants|subjects|adults|children|individuals|people|persons|cases|controls|women|men|pwe|episodes|records|respondents|eyes|samples)\\b|(?<![\\d.])${n}\\s*[)/]|/\\s*${n}(?![\\d])|(?<![\\d.])${n}\\s*\\(\\d{1,3}(?:\\.\\d+)?\\s?%\\)`,
  ).test(normalisedSentence)
}

/** Whether a text's sentence writes the figure as a count of people: "n = 1644", "1644 adults". */
export function isCountOfPeople(figure: string, normalisedSentence: string): boolean {
  if (/%|\.|mg|[a-z]/.test(figure)) return false
  const n = figure.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `\\bn\\s*=\\s*${n}(?![\\d])|(?<![\\d.])${n}\\s+(?:patients|participants|subjects|adults|children|individuals|people|persons|cases|controls|women|men|pwe|episodes|records|respondents|eyes|samples)\\b`,
  ).test(normalisedSentence)
}

/**
 * The population a passage states its figure for, when it does: "in
 * patients with psychiatric comorbidity", "among children without a
 * structural cause". Lower-cased, without the preposition. Undefined when
 * the passage names no population.
 */
export function populationQualifier(passage: string): string | undefined {
  // The frame that opens the passage's sentence, after an optional
  // timepoint: "In patients with psychiatric comorbidity who ...", "At 12
  // months, among children without ...". A population named mid-sentence
  // qualifies a clause, not the figure.
  const m =
    /^\s*(?:(?:at|after|by|over)\s+[^,]{2,30},\s+)?(?:in|among|for)\s+(?:the\s+)?(?:patients|people|participants|adults|children|subjects|individuals|pwe|those)\s+((?:with|without)\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3})(?=\s+(?:who|and|at|or|were|was|had|the|after|treated|receiving|on)\b|[,;:.(]|$)/i
      .exec(passage.replace(/\s+/g, ' '))
  if (!m) return undefined
  const qualifier = m[1]!.toLowerCase().trim()
  // A comparison of two populations ("with and without") names neither.
  if (/\bwith and without\b|\bwithout and with\b/.test(qualifier)) return undefined
  return qualifier
}

/**
 * The population a text states a figure for, when every occurrence of the
 * figure in the text opens with the same frame: a "71.1%" the paper gives
 * once for the whole cohort and once for a subgroup qualifies nothing,
 * while a "13.9%" it gives only "in patients with psychiatric
 * comorbidity" is that subgroup's figure (D3-07).
 */
export function qualifierForFigure(figure: string, text: PreparedSource): string | undefined {
  const re = figurePattern(figure, 'g')
  let qualifier: string | undefined
  let m: RegExpExecArray | null
  while ((m = re.exec(text.lower)) !== null) {
    const whole = ownSentenceBounds(text.original, m.index, false)
    const found = populationQualifier(text.original.slice(whole.start, whole.end))
    if (!found) return undefined
    if (qualifier !== undefined && found !== qualifier) return undefined
    qualifier = found
  }
  return qualifier
}

/** The sentence a position falls in, within its paragraph, in the normalised text. */
export function ownSentenceBounds(
  text: string,
  at: number,
  /** Whether a semicolon before a word ends the clause, as in `claimWindowBounds`. */
  clauses = true,
): { start: number; end: number } {
  const floor = Math.max(0, at - 500)
  const before = text.slice(floor, at)
  const clause = clauses ? ';\\s+(?=[a-z(])|' : ''
  // On a lower-cased text every sentence opens in lower case; on the
  // original a sentence opens with a capital, and an abbreviation's stop
  // ("Fig. S1a", "et al. 2020") is not a boundary.
  const opener = clauses
    ? '[.!?][\\d,-]{0,12}\\s+(?=[a-z0-9("])'
    : '(?<!\\b(?:Fig|Figs|et al|vs|e\\.g|i\\.e|No|approx|ca|cf|Dr|Prof|St|Suppl))[.!?][\\d,-]{0,12}\\s+(?=[A-Za-z0-9("])'
  const boundaries = [
    ...before.matchAll(new RegExp(`${opener}|${clause}${PARAGRAPH_MARK}\\s*`, 'g')),
  ].map((m) => m.index + m[0].length)
  const start = boundaries.length > 0 ? boundaries[boundaries.length - 1]! : 0
  const after = text.slice(at, at + 400)
  const endMatch = new RegExp(
    `[.!?](?:\\s|$)|${clauses ? ';\\s(?=[a-z(])|;$|' : ''}\\s${PARAGRAPH_MARK}`,
  ).exec(after)
  const end = endMatch ? at + endMatch.index + 1 : at + after.length
  return { start: floor + start, end }
}

/** A cited text prepared once for many figure checks. */
export interface PreparedSource {
  /** The normalised text, lower-cased; every index matches `original`. */
  lower: string
  /** The normalised text as written. */
  original: string
  pairs: { phrase: string; abbr: string }[]
}

export function prepareSource(text: string): PreparedSource {
  const original = normaliseText(text)
  return { lower: original.toLowerCase(), original, pairs: abbreviationPairs(original) }
}

/** What a sentence brings to a figure check, computed once per sentence. */
export interface ClaimFeatures {
  anchors: string[]
  words: string[]
  content: string[]
  /** Anchors the question also names: the cohort, drug or study the figure is attributed to. */
  mandatory: string[]
  outcomes: string[]
  timepoints: number[]
  /** Every figure the sentence states: two of them in one window place the claim. */
  figures: string[]
  /** The sentence as normalised, for the figure-plus-noun check. */
  normalised: string
}

export function claimFeatures(
  sentence: string,
  lexicon: readonly string[],
  questionEntities: readonly string[] = [],
): ClaimFeatures {
  // "Thirteen participants" reads "13 participants" on the answer's side
  // too, so the count is checked and the word is not a claim term.
  const digits = numberWordsToDigits(sentence)
  const { anchors, words, content } = claimTerms(digits, lexicon)
  const question = new Set(questionEntities.map((e) => e.toLowerCase()))
  return {
    anchors,
    words,
    content,
    mandatory: anchors.filter((a) => question.has(a)),
    outcomes: outcomeFamilies(sentence),
    timepoints: timepointsInMonths(normaliseFigures(digits)),
    figures: extractNumbers(sentence),
    normalised: normaliseFigures(digits).toLowerCase(),
  }
}

/** A percentage, a decimal or a count of three digits or more: a figure unlikely to recur by chance. */
function isSpecificFigure(figure: string): boolean {
  return /%|\./.test(figure) || /^\d{3,}/.test(figure)
}

/**
 * Whether one text carries the figure beside the claim: the figure must
 * occur in a window (its own sentence and up to three before it, within
 * the paragraph) that also carries one of the claim's names - or, for a
 * sentence with no names, two of its specific words, or three of its
 * content words when it has no specific words - and that window must not
 * attribute the figure to a different outcome or a different follow-up.
 * The figure followed by the same noun as in the sentence ("220
 * participants") counts as beside the claim. Every name the question also
 * uses must be somewhere in the text: a figure the sentence gives the
 * Melbourne cohort cannot come from a paper that never mentions Melbourne.
 */
export function figureSupportedBy(
  figure: string,
  claim: ClaimFeatures,
  text: PreparedSource,
): { supported: boolean; reason?: FigureCheck['reason']; passage?: string } {
  const anchorForms = claim.anchors.map((a) => termForms(a, text.pairs))
  const wordForms = claim.words.map((w) => termForms(w, text.pairs))
  const contentForms = claim.content.map((w) => termForms(w, text.pairs))
  const hits = (forms: RegExp[][], lower: string, original: string) =>
    forms.filter((alternatives) => alternatives.some((re) => re.test(lower) || re.test(original)))
      .length
  for (const name of claim.mandatory) {
    const forms = termForms(name, text.pairs)
    if (!forms.some((re) => re.test(text.lower) || re.test(text.original))) {
      return { supported: false, reason: 'entity' }
    }
  }
  const re = figurePattern(figure, 'g')
  // The noun the figure qualifies in the sentence: "220 participants".
  const SMALL = '(?:\\s+(?:of|the|in|among|a|an|per|with))*'
  const nounMatch = new RegExp(`${figurePattern(figure).source}${SMALL}\\s+([a-z][a-z-]{3,})`)
    .exec(claim.normalised)
  const noun = nounMatch?.[1]
  const nounRe = noun
    ? new RegExp(`${figurePattern(figure).source}${SMALL}\\s+${escapeRegExp(noun.slice(0, 5))}`)
    : null
  const sampleSize = isSampleSizeFigure(figure, claim.normalised)
  let m: RegExpExecArray | null
  let reason: FigureCheck['reason'] = 'absent'
  while ((m = re.exec(text.lower)) !== null) {
    const { start, end } = claimWindowBounds(text.lower, m.index)
    const lower = text.lower.slice(start, end)
    const original = text.original.slice(start, end)
    const own = ownSentenceBounds(text.lower, m.index)
    const ownSentence = text.lower.slice(own.start, own.end)
    let beside = false
    // Two of the sentence's figures in one window ("937 (52%)", "14%-35%")
    // place a claim that names nothing: two numbers matching at once is not
    // a coincidence, as long as the companion is a share, a decimal or a
    // large count rather than a small integer or a timepoint a table
    // repeats. A sentence that names an intervention, cohort or study
    // still needs that name beside the figure.
    const companions = claim.figures.filter((o) =>
      o !== figure && !isTimepointFigure(o) && isSpecificFigure(o) && figurePattern(o).test(lower)
    )
    if (claim.anchors.length === 0 && claim.words.length === 0 && claim.content.length === 0) {
      beside = true
    } else if (claim.anchors.length === 0 && companions.length > 0) {
      beside = true
    } else if (nounRe && nounRe.test(lower)) {
      beside = true
    } else if (claim.anchors.length > 0 && hits(anchorForms, lower, original) >= 1) {
      beside = true
    } else if (
      claim.anchors.length === 0 && claim.words.length > 0 &&
      hits(wordForms, lower, original) >= Math.min(2, claim.words.length)
    ) {
      // Without names, two of the claim's words must be there - a lone
      // "seizure" next to a "21%" in an epilepsy paper says nothing about
      // which 21% that is.
      beside = true
    } else if (claim.anchors.length === 0 && claim.content.length > 0) {
      // A sentence of generic words ("the sample size is 220 participants,
      // 110 per group") is placed by most of its content words together.
      const found = hits(contentForms, lower, original)
      beside = found >= Math.min(3, claim.content.length) && found / claim.content.length >= 0.5
    } else if (
      claim.anchors.length > 0 && claim.words.length >= 3 && hits(wordForms, lower, original) >= 3
    ) {
      // Names all absent from the window: three of the claim's own words
      // still place it - a paper that names the drug once in the methods
      // and writes "the drug" thereafter is not a misattribution.
      beside = true
    }
    if (
      !beside && claim.anchors.length === 0 && claim.outcomes.length > 0 &&
      !isTimepointFigure(figure) && !sampleSize &&
      outcomeFamilies(ownSentence).some((o) => claim.outcomes.includes(o)) &&
      (claim.timepoints.length === 0 ||
        timepointsInMonths(lower).some((w) => claim.timepoints.some((s) => sameTimepoint(s, w))))
    ) {
      // A claim that names no intervention, cohort or study is placed by
      // its outcome: the figure, with its unit, in a sentence about the
      // claim's own outcome at the claim's own follow-up. "BRV retention
      // was 89.4%, 79.8%, and 71.1% at 3, 6, and 12 months" carries the
      // 12-month retention of 71.1% whatever the answer called the cohort
      // (D3-02). A claim that names LITT still needs LITT beside it.
      beside = true
    }
    if (!beside && sampleSize && isCountOfPeople(figure, ownSentence)) {
      // A count the answer states as a sample size ("n = 1644") is placed
      // by the paper writing it as a count of people too ("1644 adults",
      // "n = 1644") - never by a bare table cell "38 (79)", which counts
      // something else; the sentence's other figures still have to match.
      beside = true
    }
    // And the other way round: a sample size the claim states is never
    // placed by a bare number in a range or a score ("[6-231]") whatever
    // names sit beside it; the text's own sentence must count with it.
    if (beside && sampleSize && !isSampleSizeFigure(figure, ownSentence)) {
      if (reason === 'absent') reason = 'terms'
      continue
    }
    if (!beside) {
      if (reason === 'absent') reason = 'terms'
      continue
    }
    // The statistic's own qualifier travels with the figure: an "adjusted"
    // ratio is placed only by a passage that says adjusted (or names the
    // multivariable model), and a median by a passage that says median,
    // never by a table's univariable column or a sentence about the mean
    // (D4-18). The claim's terms are otherwise satisfied, so the reason
    // stays 'terms'.
    if (!sampleSize && !isTimepointFigure(figure) && statisticQualifierConflict(claim, lower)) {
      if (reason === 'absent') reason = 'terms'
      continue
    }
    // A sample size is placed by its noun and contradicts no outcome or
    // follow-up; a result is judged by the sentence it sits in first, then
    // by the passage before it.
    if (!sampleSize && !isTimepointFigure(figure)) {
      if (timepointConflict(claim.timepoints, lower)) {
        reason = 'timepoint'
        continue
      }
      const ownOutcomes = outcomeFamilies(ownSentence)
      const conflict = ownOutcomes.length > 0
        ? outcomeConflict(claim.outcomes, ownSentence)
        : outcomeConflict(claim.outcomes, lower)
      if (conflict) {
        reason = 'outcome'
        continue
      }
    }
    // The passage reported is the whole sentence: its opening frame names
    // the population the figure is for.
    // Bounds read on the original case: a lower-cased "Fig. S1a" would
    // read as a sentence end.
    const whole = ownSentenceBounds(text.original, m.index, false)
    return { supported: true, passage: text.original.slice(whole.start, whole.end) }
  }
  return { supported: false, reason }
}

/**
 * Whether the claim qualifies its statistic in a way the window does not:
 * the claim says "adjusted" (or writes aHR, aOR) and the window never says
 * adjusted or multivariable; the claim says "median" and the window gives a
 * mean but no median, or the other way round.
 */
export function statisticQualifierConflict(claim: ClaimFeatures, window: string): boolean {
  const sentence = claim.normalised
  if (
    /\badjusted\b|\ba(?:hr|or|rr|irr)\b/.test(sentence) &&
    !/\badjust|\bmultivaria|\ba(?:hr|or|rr|irr)\b/.test(window)
  ) return true
  if (/\bmedian\b/.test(sentence) && /\bmean\b/.test(window) && !/\bmedian\b/.test(window)) {
    return true
  }
  if (/\bmean\b/.test(sentence) && /\bmedian\b/.test(window) && !/\bmean\b/.test(window)) {
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// "all p < x" is a claim about each outcome the sentence lists
// ---------------------------------------------------------------------------

export interface PValueListClaim {
  /** The outcomes the sentence lists before the bound, lower-cased. */
  items: string[]
  /** The bound as written: "0.001", "0.05". */
  bound: string
  /** "<" or "=". */
  operator: string
}

/**
 * The "absenteeism, presenteeism and activity impairment (all p < 0.001)"
 * form: a list of outcomes followed by one bound for all of them. The
 * items are the comma- or "and"-separated phrases of the clause before
 * the bracket, each cut to its last four words. Undefined when the
 * sentence carries no such claim.
 */
export function pValueListClaim(sentence: string): PValueListClaim | undefined {
  const m = /([^.;:()]{8,240}?)\s*\(\s*all\s+p\s*([<=≤])\s*(0?\.\d+)\s*\)/i.exec(
    normaliseFigures(sentence),
  )
  if (!m) return undefined
  const clause = m[1]!.replace(
    /\b(?:over|at|after|within)\s+\d+\s+(?:months?|weeks?|years?)\b/gi,
    '',
  )
  const lead = clause.split(
    /\b(?:reductions?|increases?|improvements?|changes?|decreases?)\s+in\s+/i,
  )
  const list = lead.length > 1 ? lead[lead.length - 1]! : clause
  const items = list
    .split(/,\s*|\s+and\s+/i)
    .map((s) =>
      s.toLowerCase().replace(/^(?:and|or)\s+/, '').replace(/[^a-z\s-]/g, ' ').trim().split(/\s+/)
        .slice(-4).join(' ')
    )
    .filter((s) => s.length >= 4)
  if (items.length < 2) return undefined
  return { items, bound: m[3]!.replace(/^\./, '0.'), operator: m[2] === '=' ? '=' : '<' }
}

/**
 * The outcome in an "all p < x" list whose own p value in the text does
 * not satisfy the bound: "activity impairment (p = 0.002)" under "all p <
 * 0.001" (D4-13). Each item is looked up as its last two words followed,
 * within 60 characters, by a p value; an item the text never gives a p
 * value for is left to the ordinary figure check. Undefined when nothing
 * contradicts the bound.
 */
export function pValueListConflict(
  claim: PValueListClaim,
  text: PreparedSource,
): string | undefined {
  const bound = Number(claim.bound)
  for (const item of claim.items) {
    const key = item.split(' ').slice(-2).map((w) => w.slice(0, 7)).join('[a-z]*[\\s-]+')
    const re = new RegExp(
      `${key}[a-z]*[^.;()]{0,60}?\\(\\s*(?:hb-\\s*)?p\\s*-?\\s*(?:value)?\\s*([<=≤>])\\s*(0?\\.\\d+)\\s*\\)`,
      'i',
    )
    const m = re.exec(text.lower)
    if (!m) continue
    const value = Number(m[2]!.replace(/^\./, '0.'))
    const op = m[1]!
    const satisfied = op === '<' || op === '≤'
      ? value <= bound
      : op === '=' && (claim.operator === '<' ? value < bound : value === bound)
    if (!satisfied) return item
  }
  return undefined
}

/**
 * Checks every figure in each sentence against the texts that sentence is
 * bound to (`figureSupportedBy`). A sentence bound to no text is checked
 * against every cited text under the same rule, and the texts that support
 * it are reported so the sentence can inherit a marker.
 */
export function verifyFigures(
  sentences: readonly { text: string; texts: readonly string[] }[],
  allTexts: readonly string[],
  lexicon: readonly string[] = [],
  questionEntities: readonly string[] = [],
): FigureCheck[] {
  const out: FigureCheck[] = []
  const prepared = new Map<string, PreparedSource>()
  const prepare = (t: string) => {
    let v = prepared.get(t)
    if (v === undefined) {
      v = prepareSource(t)
      prepared.set(t, v)
    }
    return v
  }
  for (const sentence of sentences) {
    const figures = extractNumbers(sentence.text)
    if (figures.length === 0) continue
    const claim = claimFeatures(sentence.text, lexicon, questionEntities)
    const texts = (sentence.texts.length > 0 ? sentence.texts : allTexts).map(prepare)
    const pList = pValueListClaim(sentence.text)
    for (const figure of figures) {
      const supportedBy: number[] = []
      let passage: string | undefined
      let reason: FigureCheck['reason'] | undefined
      texts.forEach((text, i) => {
        // The bound of an "all p < x" claim holds only when every listed
        // outcome's own p value in the text satisfies it (D4-13).
        if (pList && figure === pList.bound && pValueListConflict(pList, text)) {
          reason = 'pvalue'
          return
        }
        const verdict = figureSupportedBy(figure, claim, text)
        if (verdict.supported) {
          supportedBy.push(i)
          if (passage === undefined) passage = verdict.passage
        } else if (reason === undefined || reason === 'absent') reason = verdict.reason
      })
      const supported = supportedBy.length > 0
      out.push({
        figure,
        sentence: sentence.text,
        supported,
        supportedBy,
        ...(passage !== undefined ? { passage } : {}),
        ...(supported ? {} : { reason: reason ?? 'absent' }),
      })
    }
  }
  return out
}

/**
 * The passage a figure belongs to: its own sentence and up to three before
 * it, never crossing a paragraph break, bounded so a long paragraph cannot
 * lend it a name from far away. The sentence after is excluded on purpose
 * - "76% at 12 months. ... 68% for LITT" must not let LITT claim the 76%.
 */
export function claimWindow(text: string, at: number): string {
  const { start, end } = claimWindowBounds(text, at)
  return text.slice(start, end)
}

/** The bounds `claimWindow` slices, for callers that slice a parallel text. */
export function claimWindowBounds(text: string, at: number): { start: number; end: number } {
  const floor = Math.max(0, at - 500)
  const before = text.slice(floor, at)
  // A semicolon ends a clause only before a word: "(aHR = 0.56; 95% CI
  // 0.31-1.01)" is one statistic, and the drug named before it vouches
  // for the interval after it. A paragraph break (a heading, a table row)
  // counts as a boundary too, so a table cell reaches its column heading.
  // A sentence may end in its reference numbers ("over time.10 ").
  const boundaries = [
    ...before.matchAll(
      new RegExp(
        `[.!?][\\d,-]{0,12}\\s+(?=[a-z0-9("])|;\\s+(?=[a-z(])|${PARAGRAPH_MARK}\\s*`,
        'g',
      ),
    ),
  ].map((m) => m.index + m[0].length)
  // Fewer than four boundaries in the span means the span is within three
  // sentences back: all of it is the window.
  const start = boundaries.length >= 4 ? boundaries[boundaries.length - 4]! : 0
  // The sentence after is never part of the window, nor the next paragraph.
  const after = text.slice(at, at + 250)
  const endMatch = new RegExp(`[.!?](?:\\s|$)|;\\s(?=[a-z(])|;$|\\s${PARAGRAPH_MARK}`).exec(after)
  const end = endMatch ? at + endMatch.index + 1 : at + after.length
  return { start: floor + start, end }
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
    /** Proportions stated without a denominator, with the n the passage gives when it does. */
    denominators?: DenominatorCheck[]
    /** Study designs, in the sources' own words, for citations whose first sentence named none. */
    designs?: { index: number; design: string }[]
    /** Attributions rewritten because the cited paper lacks the named author. */
    attributions?: { surname: string; replacedWith: string }[]
    /** Boundary sentences, already in the portal's voice. */
    notes?: string[]
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
  if (input.denominators && input.denominators.length > 0) {
    const stated = input.denominators.filter((d) => d.stated)
    const bare = input.denominators.filter((d) => !d.stated)
    const pieces: string[] = []
    if (stated.length > 0) {
      pieces.push(
        `the cited passage gives ${
          stated.map((d) => `${d.stated} for ${d.figure}${d.index ? ` [${d.index}]` : ''}`).join(
            ', ',
          )
        }`,
      )
    }
    if (bare.length > 0) {
      pieces.push(
        `${bare.map((d) => d.figure).join(', ')} ${
          bare.length === 1 ? 'is' : 'are'
        } stated without a denominator, and the cited passage gives none beside the figure`,
      )
    }
    parts.push(`*Denominators: ${pieces.join('; ')}.*`)
  }
  if (input.designs && input.designs.length > 0) {
    parts.push(
      `*Study designs, in the sources' own words: ${
        input.designs.map((d) => `[${d.index}] ${d.design}`).join('; ')
      }.*`,
    )
  }
  if (input.attributions && input.attributions.length > 0) {
    const names = [...new Set(input.attributions.map((a) => a.surname))].join(', ')
    parts.push(
      `*${
        input.attributions.length === 1 ? 'One sentence' : `${input.attributions.length} sentences`
      } attributed work to ${names} while citing a paper without that author; the attribution was ` +
        "corrected to the cited paper's own authors.*",
    )
  }
  for (const note of input.notes ?? []) parts.push(note)
  return parts.length > 0 ? `\n\n${parts.join('\n\n')}` : ''
}

// ---------------------------------------------------------------------------
// Denominators: a proportion without its n is not a figure a clinician can
// repeat. The prompt asks for the n; this reports where it was left out and,
// when the cited passage states it, what it is.
// ---------------------------------------------------------------------------

/** "n = 1644", "(n=51)", "1644 patients", "of 1644 participants", "1,805 adults", "5/8", "29 (48%)". */
const COUNT_IN_SENTENCE =
  /\b(?:n\s*=\s*\d[\d,]*|\d[\d,]{1,}\s*(?:\/\s*\d[\d,]*)?\s+(?:patients|participants|subjects|adults|children|individuals|people|persons|cases|women|men|pwe|episodes|admissions|records|respondents|controls)\b|\b(?:of|among|in)\s+(?:the\s+)?\d[\d,]{1,}\b|\b\d+\s*\/\s*\d+\b|\b\d[\d,]*\s*\(\d{1,2}(?:\.\d+)?\s?%\))/i

/** Whether a sentence states a count that can serve as a denominator for its proportions. */
export function statesDenominator(sentence: string): boolean {
  return COUNT_IN_SENTENCE.test(sentence.replace(/\[\d{1,3}\]/g, ' '))
}

/**
 * Percentages in the sentence: the figures that need a denominator. The
 * "95%" of a confidence interval is not a proportion, and a hazard ratio,
 * an odds ratio, a standardised mortality ratio or a p value never takes
 * one - a ratio has no n of its own to pair with.
 */
export function proportions(sentence: string): string[] {
  const plain = sentence
    // A confidence interval and its bounds, an I-squared, a change: none is a share of a cohort.
    .replace(/\(?\b\d+(?:\.\d+)?\s?%\s?(?:CI\b|confidence interval)[^)]*\)?/gi, ' ')
    .replace(/\bI\s?[²2]\s*=\s*\d+(?:\.\d+)?\s?%/gi, ' ')
    .replace(
      /\b\d+(?:\.\d+)?\s?%\s+(?:higher|lower|greater|less|more|fewer|smaller|larger)\b/gi,
      ' ',
    )
    .replace(/\b\d+(?:\.\d+)?\s?%\s*(?:CI\b|confidence)/g, ' ')
    // An effect size ("a 20% greater reduction", "fell by 14%") is a change,
    // not a share of a cohort: no denominator applies.
    .replace(
      /\b(?:by|a|an|up to)\s+\d+(?:\.\d+)?\s?%(?:\s+\w+){0,2}\s+(?:greater|reduction|increase|decrease|lower|higher|improvement|change|rise|fall|drop|relative)\b/gi,
      ' ',
    )
    .replace(
      /\b\d+(?:\.\d+)?\s?%\s+(?:reduction|increase|decrease|improvement|change|rise|fall|drop)\b/gi,
      ' ',
    )
    .replace(
      /\b(?:fell|rose|reduced|increased|decreased|dropped|improved|declined|lower|higher|greater|less|more|reduction|increase|decrease)\s+(?:by\s+)?\d+(?:\.\d+)?\s?%/gi,
      ' ',
    )
    // The threshold that names a responder ("50% responder rate", "≥ 50%
    // seizure reduction") is a definition, not a share of anyone (D4-05).
    .replace(
      /(?:[≥>]=?|at least|more than|over)?\s*\b\d{2}\s?%\s+(?:(?:seizure\s+)?(?:reduction|response|responder|responders)\b)/gi,
      ' ',
    )
  return [...new Set(extractNumbers(plain).filter((f) => f.endsWith('%')))]
}

/** The sentence of a normalised text that contains the position, within its paragraph, and where it starts. */
function sentenceAround(text: string, at: number): { sentence: string; start: number } {
  const floor = Math.max(0, at - 400)
  const before = text.slice(floor, at)
  const startMatch = new RegExp(`.*(?:[.!?]\\s+(?=[A-Z0-9("])|${PARAGRAPH_MARK}\\s*)`, 's').exec(
    before,
  )
  const start = startMatch ? startMatch[0].length : 0
  const after = text.slice(at, at + 300)
  const endMatch = new RegExp(`[.!?](?:\\s|$)|\\s${PARAGRAPH_MARK}`).exec(after)
  const end = endMatch ? endMatch.index + 1 : after.length
  return { sentence: before.slice(start) + after.slice(0, end), start: floor + start }
}

/**
 * The n a cited text pairs with a proportion in the same parenthesis or
 * the same table cell, and nowhere else (docs/persona-reports/
 * dsouza-loop4.md D4-05, D3-13): "64.2% (2698/4201)", "14.9% (n = 1111)",
 * "29 (48%)" and the "38 (79)" of a table row. The n nearest the figure
 * elsewhere in the sentence is never taken - "36.7% (n = 867), and 36.9%
 * (n = 822)" pairs 36.9% with 822 only, and a passage that gives the
 * figure without its own bracket gives no denominator. Undefined when no
 * occurrence carries one.
 */
export function denominatorBeside(figure: string, texts: readonly string[]): string | undefined {
  const re = figurePattern(figure, 'g')
  for (const raw of texts) {
    const text = normaliseText(raw)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const paired = denominatorInParenthesis(text, m.index, m[0].length, figure)
      if (paired) return paired
    }
  }
  return undefined
}

/**
 * The denominator written in the same parenthesis as the figure at `at`
 * in a normalised text, or the count the figure is the share of ("29
 * (48%)"), or undefined.
 */
function denominatorInParenthesis(
  text: string,
  at: number,
  length: number,
  figure: string,
): string | undefined {
  const rest = text.slice(at + length)
  // "64.2% (3031/4721)" - the fraction right after the figure is its n.
  const fraction = /^\s*\((\d[\d,]*\s*\/\s*\d[\d,]*)\)/.exec(rest)
  if (fraction?.[1]) return fraction[1].replace(/\s+/g, '')
  // "14.9% (n = 1111)", "14.9% (n = 1111, FAS)".
  const bracketed = /^\s*\(\s*n\s*=\s*(\d(?:[\d,]*\d)?)(?:\s*[,;]\s*[^)]{0,40})?\)/i.exec(rest)
  if (bracketed?.[1]) return `n = ${bracketed[1]}`
  // "(n = 1111; 14.9%)", "(14.9%; n = 1111)": the figure inside a bracket
  // that also carries an n, and nothing else.
  const open = text.lastIndexOf('(', at)
  const close = text.indexOf(')', at)
  if (open !== -1 && close !== -1 && close > at && text.slice(open, at).indexOf(')') === -1) {
    const inside = text.slice(open + 1, close)
    if (inside.length <= 60) {
      const n = /\bn\s*=\s*(\d(?:[\d,]*\d)?)/i.exec(inside)
      if (n?.[1]) return `n = ${n[1]}`
    }
  }
  // "29 (48%) of 60 patients", "29 (48%) patients met", and a table's
  // "38 (79%)": the count the share was taken of, with the whole when
  // the same sentence gives it.
  const before = text.slice(Math.max(0, at - 12), at)
  const counted = /(\d[\d,]*) \($/.exec(before)
  const { sentence } = sentenceAround(text, at)
  if (counted?.[1] && /^\s*\)/.test(rest)) {
    const whole = /\b(?:of|among)\s+(?:the\s+)?(\d[\d,]{1,})\b/i.exec(sentence)
    return whole?.[1] ? `${counted[1]} of ${whole[1]}` : `${counted[1]} (${figure})`
  }
  // One share and one "(n = N)" in the sentence cannot be mis-paired:
  // "retention was 71.1% in the full analysis set (n = 1644)".
  const shares = sentence.match(/(?<![\d.])\d+(?:\.\d+)?\s?%(?!\s?(?:CI|confidence))/g) ?? []
  const ns = sentence.match(/\(\s*n\s*=\s*\d(?:[\d,]*\d)?\s*\)/gi) ?? []
  if (shares.length === 1 && ns.length === 1) {
    const n = /\d(?:[\d,]*\d)?/.exec(ns[0]!)
    if (n) return `n = ${n[0]}`
  }
  return undefined
}

export interface DenominatorCorrection {
  figure: string
  /** The n the answer paired with the figure. */
  from: string
  /** The pairing the cited passage gives in the figure's own parenthesis. */
  to: string
}

/**
 * The denominators a sentence pairs with its proportions that the cited
 * passage pairs differently (D4-05): "17.6% (n = 5193, full analysis set)"
 * where the paper writes "17.6% (739/4201)". Only a parenthesis that
 * follows the figure in the sentence counts on the answer's side, and only
 * the figure's own parenthesis on the passage's side; a sentence that
 * carries the passage's own n, or a passage with no bracket, corrects
 * nothing. Each correction carries the sentence rewritten with the
 * passage's pairing.
 */
export function denominatorCorrections(
  sentence: string,
  texts: readonly string[],
): { corrections: DenominatorCorrection[]; text: string } {
  const corrections: DenominatorCorrection[] = []
  let text = sentence
  for (const figure of proportions(sentence)) {
    const own = new RegExp(
      `${
        figurePattern(figure).source
      }\\s*\\(\\s*(?:n\\s*=\\s*)?(\\d[\\d,]*)(?:\\s*\\/\\s*(\\d[\\d,]*))?(?:\\s*[,;]\\s*[^)]{0,60})?\\)`,
      'i',
    )
    const m = own.exec(text)
    if (!m) continue
    const stated = denominatorBeside(figure, texts)
    if (!stated) continue
    const ns = stated.match(/\d[\d,]*/g)?.map((n) => n.replace(/,/g, '')) ?? []
    const answerNs = [m[1]!, m[2]].filter((n): n is string => n !== undefined).map((n) =>
      n.replace(/,/g, '')
    )
    // The answer's n is one the passage pairs with the figure: no correction.
    if (answerNs.some((n) => ns.includes(n))) continue
    const at = m.index
    text = `${text.slice(0, at)}${figure} (${stated})${text.slice(at + m[0].length)}`
    corrections.push({ figure, from: m[2] ? `${m[1]}/${m[2]}` : `n = ${m[1]}`, to: stated })
  }
  return { corrections, text }
}

export interface DenominatorCheck {
  figure: string
  /** The n the cited passage states beside the figure, when it does. */
  stated?: string
  /** The marker of the passage the n came from. */
  index?: number
}

/**
 * Proportions the answer states in a sentence that carries no count of its
 * own, each with the denominator its bound passage gives when one is there.
 */
export function denominatorsMissing(
  sentences: readonly { text: string; texts: readonly { index: number; text: string }[] }[],
): DenominatorCheck[] {
  const out: DenominatorCheck[] = []
  const seen = new Set<string>()
  for (const sentence of sentences) {
    const figures = proportions(sentence.text)
    if (figures.length === 0 || statesDenominator(sentence.text)) continue
    for (const figure of figures) {
      if (seen.has(figure)) continue
      seen.add(figure)
      let found: DenominatorCheck = { figure }
      for (const { index, text } of sentence.texts) {
        const stated = denominatorBeside(figure, [text])
        if (stated) {
          found = { figure, stated, index }
          break
        }
      }
      out.push(found)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Study design, in the source's own words
// ---------------------------------------------------------------------------

/** Design phrases in priority order: the most specific self-description wins. */
const DESIGNS: [RegExp, string][] = [
  [/\bsystematic review\b|\bmeta-?analys/i, 'a systematic review'],
  [/\bpooled analysis\b|\bindividual patient data\b/i, 'a pooled analysis'],
  // A paper that IS a protocol says so of itself; "the study protocol was
  // approved" is every trial's ethics line.
  [
    /\b(?:this|the present) (?:study |trial )?protocol\b|\bprotocol for an? \b|\b(?:describes?|presents?|outlines?|reports?) the (?:study |trial )?protocol\b|\bstudy protocol\b.{0,60}\b(?:randomi[sz]ed|controlled) trial\b/i,
    'a trial protocol',
  ],
  [
    /\brandomi[sz]ed\b.{0,40}\b(?:trial|study)\b|\bplacebo-controlled\b|\bdouble-blind/i,
    'a randomised controlled trial',
  ],
  [/\bnested,? case[-‐–—]?\s?control\b/i, 'a nested case-control study'],
  [/\bcase[-‐–—]?\s?control\b/i, 'a case-control study'],
  [/\bfirst-in-human\b/i, 'a first-in-human study'],
  [
    /\bprospective\b.{0,30}\bcohort\b|\bcohort study\b|\bobservational cohort\b/i,
    'an observational cohort study',
  ],
  [/\bretrospective\b.{0,30}\b(?:cohort|study|analysis|review)\b/i, 'a retrospective cohort study'],
  [/\bcross-sectional\b/i, 'a cross-sectional study'],
  [/\bcase series\b/i, 'a case series'],
  [/\bcase report\b/i, 'a case report'],
  [/\bsurvey\b/i, 'a survey'],
  [
    // A paper that IS a model says so; a data study that "used a
    // mathematical model" to interpret its recordings is not one.
    /\bmodel(?:ling|ing) study\b|\bsimulation study\b|\bwe simulated\b|\bin silico\b|\b(?:computational|dynamic(?:al)? network) model of\b/i,
    'a modelling study',
  ],
  [/\bnarrative review\b|\breview article\b|\bthis review\b/i, 'a narrative review'],
  [/\bobservational study\b|\bprospective study\b|\bprospective, /i, 'an observational study'],
]

/**
 * How a paper describes its own design, from its opening pages: "a nested
 * case-control study", "a modelling study". Undefined when the text never
 * says - the audit reports designs, it never guesses them.
 */
export function studyDesignOf(text: string): string | undefined {
  const head = text.slice(0, 8000)
  for (const [re, label] of DESIGNS) if (re.test(head)) return label
  return undefined
}
