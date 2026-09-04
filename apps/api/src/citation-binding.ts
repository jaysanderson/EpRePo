/**
 * Sentence-level citation binding.
 *
 * The platform binds citations at paragraph granularity: its char offsets
 * land at the end of a block, so a paragraph of four claims arrives as
 * "...claim four.[1][2][3][4][5][6][7]" and nothing says which passage
 * supports which sentence. Reviewers checked and found markers on sentences
 * whose cited paper does not contain the claim. This pass re-derives the
 * binding claim by claim: each sentence keeps only the markers whose cited
 * text actually carries the sentence's content words, figures and named
 * entities, gains a marker to a cited text that clearly does when its own
 * markers resolve to nothing, and loses every marker otherwise. Headings
 * never carry markers. The surviving citations are renumbered in order of
 * first appearance, so "n cited" and the chips describe the bound set.
 *
 * Deterministic string matching only - no model in the loop - so the
 * binding is itself grounded.
 */
import type { Citation } from '@research-portal/core'
import {
  type ClaimFeatures,
  claimFeatures,
  extractNumbers,
  figureSupportedBy,
  normaliseFigures,
  type PreparedSource,
  prepareSource,
} from './answer-audit.ts'

const STOPWORDS = new Set([
  'about',
  'above',
  'after',
  'again',
  'against',
  'also',
  'although',
  'among',
  'another',
  'appear',
  'appears',
  'approximately',
  'around',
  'associated',
  'based',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'clinical',
  'compared',
  'could',
  'data',
  'does',
  'during',
  'each',
  'effect',
  'effects',
  'either',
  'evidence',
  'example',
  'finding',
  'findings',
  'found',
  'from',
  'further',
  'generally',
  'given',
  'have',
  'having',
  'here',
  'however',
  'including',
  'indicate',
  'indicated',
  'indicates',
  'into',
  'known',
  'less',
  'like',
  'likely',
  'made',
  'many',
  'more',
  'most',
  'much',
  'must',
  'need',
  'noted',
  'only',
  'other',
  'others',
  'over',
  'particularly',
  'patient',
  'patients',
  'people',
  'potential',
  'provide',
  'provided',
  'provides',
  'rather',
  'related',
  'report',
  'reported',
  'reports',
  'research',
  'result',
  'results',
  'same',
  'several',
  'shown',
  'shows',
  'showed',
  'significant',
  'significantly',
  'since',
  'some',
  'source',
  'sources',
  'specific',
  'specifically',
  'still',
  'studies',
  'study',
  'such',
  'suggest',
  'suggested',
  'suggests',
  'than',
  'that',
  'their',
  'them',
  'then',
  'there',
  'therefore',
  'these',
  'they',
  'this',
  'those',
  'though',
  'through',
  'thus',
  'under',
  'used',
  'using',
  'various',
  'very',
  'well',
  'were',
  'what',
  'when',
  'where',
  'whether',
  'which',
  'while',
  'with',
  'within',
  'without',
  'would',
  'year',
  'years',
  'yes',
])

/** Acronyms that look like gene symbols but are not named entities of a claim. */
const NOT_ENTITY =
  /^(PMC|DOI|EEG|MRI|PET|ASM|ASMS|RCT|ILAE|HR|CI|OR|RR|SD|IQR|AUC|FDA|TGA|USA|UK|AND|THE|FOR|NOT|WITH|QOL|TBI)\d*$/

/** Words that end a sentence but are not sentence boundaries when followed by a full stop. */
const ABBREVIATION =
  /(?:\b(?:e\.g|i\.e|et al|vs|fig|figs|dr|mr|mrs|ms|prof|approx|ca|cf|no|resp|ref|refs|vol|pp|p|st|sec|min|max|inc|ltd|al)|\b[A-Z])$/i

/** One suffix strip then a six-character cut: enough that "contraindicated" and "contraindication" meet. */
export function stem(word: string): string {
  const w = word.toLowerCase().replace(/'s$/, '')
  const stripped = w.replace(
    /(ations|ation|tions|tion|ities|ity|ness|ments|ment|ingly|ally|ing|ies|ied|ed|ers|er|es|s|ly|al|e)$/,
    '',
  )
  const base = stripped.length >= 3 ? stripped : w
  return base.length > 6 ? base.slice(0, 6) : base
}

/** The words that carry a sentence's content: four letters or more, not a stopword, stemmed. */
export function contentWords(text: string): string[] {
  const out: string[] = []
  for (const m of text.toLowerCase().matchAll(/[a-z][a-z-]{3,}/g)) {
    const word = m[0].replace(/-/g, '')
    if (word.length < 4 || STOPWORDS.has(word)) continue
    out.push(stem(word))
  }
  return out
}

/** A cited text prepared once for many sentence checks: the audit's normalised source plus its vocabulary. */
export interface PreparedText extends PreparedSource {
  vocab: Set<string>
  bigrams: Set<string>
}

export function prepareText(text: string): PreparedText {
  const source = prepareSource(text)
  const words = contentWords(source.lower)
  const vocab = new Set(words)
  const bigrams = new Set<string>()
  for (let i = 1; i < words.length; i++) bigrams.add(`${words[i - 1]} ${words[i]}`)
  return { ...source, vocab, bigrams }
}

export interface SentenceFeatures {
  words: string[]
  bigrams: string[]
  numbers: string[]
  entities: string[]
  /** What the audit's figure check needs: the claim's terms, outcome, timepoint and question-named entities. */
  claim: ClaimFeatures
}

/** Named entities a claim hangs on: lexicon terms, gene symbols and capitalised names mid-sentence. */
export function namedEntities(sentence: string, lexicon: readonly string[]): string[] {
  const found = new Set<string>()
  const lower = sentence.toLowerCase()
  for (const term of lexicon) {
    const t = term.toLowerCase()
    if (t.length >= 4 && lower.includes(t)) found.add(t)
  }
  for (const m of sentence.matchAll(/\b[A-Z][A-Z0-9]{2,7}\b/g)) {
    if (!NOT_ENTITY.test(m[0])) found.add(m[0].toLowerCase())
  }
  // A capitalised word that is not sentence-initial: a syndrome, a study
  // name, a species ("Sprague-Dawley"), a register ("EURAP").
  for (
    const m of sentence.matchAll(/(?<=[^.!?\n]\s|[(,;]\s?)([A-Z][a-z]{3,}(?:-[A-Z][a-z]+)?)\b/g)
  ) {
    const word = m[1]!
    if (!STOPWORDS.has(word.toLowerCase())) found.add(word.toLowerCase())
  }
  return [...found]
}

export function sentenceFeatures(
  sentence: string,
  lexicon: readonly string[],
  questionEntities: readonly string[] = [],
): SentenceFeatures {
  const plain = sentence.replace(/\[\d{1,3}\]/g, ' ')
  const words = contentWords(plain)
  const bigrams: string[] = []
  for (let i = 1; i < words.length; i++) bigrams.push(`${words[i - 1]} ${words[i]}`)
  return {
    words,
    bigrams,
    numbers: extractNumbers(normaliseFigures(plain)),
    entities: namedEntities(plain, lexicon),
    claim: claimFeatures(plain, lexicon, questionEntities),
  }
}

/**
 * Whether a cited text supports a sentence: its named entities and figures
 * must be present, and enough of its content words (and word pairs) must
 * be found for the sentence to be a paraphrase of something the text says.
 * Returns the match strength so competing supporters can be ranked.
 */
export function supportScore(
  features: SentenceFeatures,
  text: PreparedText,
  /**
   * The sentence's words that few of the cited texts carry (see
   * `rareWords`). A text that has none of them is not the passage the
   * sentence paraphrases, however well it covers the ordinary words: a
   * levetiracetam paper covers "levetiracetam ... efficacy ... criteria"
   * and still says nothing about non-inferiority.
   */
  rare: readonly string[] = [],
): number {
  const { words, bigrams, numbers, entities } = features
  if (rare.length > 0 && !rare.some((w) => text.vocab.has(w))) return 0
  // The names a claim hangs on must be in the text: both of two, most of
  // many. A drug list cited to a paper that names one drug of four is the
  // misbinding reviewers caught most often.
  const entityHits = entities.filter((e) => text.lower.includes(e)).length
  if (entities.length > 0 && entityHits === 0) return 0
  if (entities.length <= 2 && entityHits < entities.length) return 0
  if (entities.length > 2 && entityHits / entities.length < 0.6) return 0
  // A name the question also uses - the cohort, drug or study the sentence
  // attributes its figures to - must be in the text whatever the others do:
  // a fenfluramine trial never mentions the Melbourne cohort.
  for (const name of features.claim.mandatory) {
    if (!text.lower.includes(name)) return 0
  }
  // Every figure the sentence states must be in the text beside the claim's
  // own terms, not merely somewhere in it: "21% to 45%" bound to a paper
  // that carries only the 45% is the misattribution reviewers scored as a
  // P0, and a "79.8%" that a brivaracetam paper carries for brivaracetam
  // does not let it vouch for a perampanel sentence.
  const numberHits = numbers.filter((n) => figureSupportedBy(n, features.claim, text).supported)
    .length
  if (numbers.length > 0 && numberHits < numbers.length) return 0
  const wordHits = words.filter((w) => text.vocab.has(w)).length
  const wordRate = words.length > 0 ? wordHits / words.length : 0
  const bigramHits = bigrams.filter((b) => text.bigrams.has(b)).length
  const bigramRate = bigrams.length > 0 ? bigramHits / bigrams.length : 0
  const anchored = numberHits > 0 || entityHits > 0
  // A long paper's vocabulary covers most ordinary words, so an unanchored
  // sentence (no figure, no name) needs its word pairs found too - "visual
  // field loss" as a phrase, not "visual" and "loss" somewhere in 40 pages.
  let ok = false
  if (words.length < 3) ok = anchored
  else if (anchored) ok = wordRate >= 0.45 || bigramRate >= 0.2
  else if (wordRate >= 0.5 && bigramRate >= 0.25) ok = true
  else if (wordRate >= 0.85 && words.length >= 5 && bigramRate >= 0.1) ok = true
  if (!ok) return 0
  return Math.min(
    1,
    0.55 * wordRate + 0.3 * bigramRate + (numberHits > 0 ? 0.1 : 0) + (entityHits > 0 ? 0.05 : 0),
  )
}

/**
 * The sentence's content words that at most a third of the cited texts
 * carry (one of two, when only two were fetched). With one text nothing is
 * rare enough to judge by, and a word no text carries at all cannot pick a
 * supporter either.
 */
export function rareWords(words: readonly string[], texts: readonly PreparedText[]): string[] {
  if (texts.length < 2) return []
  const ceiling = Math.max(1, Math.floor(texts.length / 3))
  return [...new Set(words)].filter((w) => {
    const df = texts.filter((t) => t.vocab.has(w)).length
    return df >= 1 && df <= ceiling
  })
}

// ---------------------------------------------------------------------------
// Reference-list detection: a bibliography entry is never a passage that
// supports a claim, so it is cut out of a cited text before matching.
// ---------------------------------------------------------------------------

/** "12. Smith AB, Jones C. Title. J Neurol. 2019;45:1-9." and its relatives. */
export function looksLikeBibliographyEntry(paragraph: string): boolean {
  const p = paragraph.trim()
  if (p.length < 25 || p.length > 1500) return false
  const numbered = /^(?:\[\d{1,3}\]|\d{1,3}[.)]|\d{1,3}\s)/.test(p)
  const year = /\b(?:19|20)\d{2}\b/.test(p)
  const doi = /\b(?:doi|https?:\/\/doi\.org|10\.\d{4,})\b/i.test(p)
  const authors = (p.match(/\b[A-Z][a-z]+(?:-[A-Z][a-z]+)? [A-Z]{1,3}\b[,.]/g) ?? []).length
  const etAl = /\bet al\b/i.test(p)
  const journalish =
    /\b(?:\d{1,4}\s*[;:]\s*\d+|\d+\s*[(]\d+[)]\s*[:]\s*\d+|vol\.?\s*\d+|pp?\.\s*\d+|\d+-\d+\.?$)/i
      .test(p)
  if (numbered && year && (authors >= 2 || etAl || doi || journalish)) return true
  if (doi && year && (authors >= 1 || etAl)) return true
  return authors >= 3 && year && journalish
}

/**
 * Whether a retrieved passage is a slice of a reference list: one entry, or
 * a run of numbered author-initial entries and journal citations. Catches
 * the mid-list chunks ("2018;90(1):e67. 58. Devinsky O, Cross JH ...") the
 * provider's density check lets through.
 */
export function looksLikeReferencePassage(passage: string): boolean {
  const p = passage.trim()
  if (!p) return false
  if (looksLikeBibliographyEntry(p)) return true
  const numberedAuthors =
    (p.match(/(?:^|\s)\d{1,3}\.\s+[A-Z][A-Za-z'-]+\s+[A-Z]{1,3}[,.]/g) ?? []).length
  const journalRefs = (p.match(/\b(?:19|20)\d{2};\s?\d{1,4}(?:\(\d+\))?:\s?[e]?\d+/g) ?? []).length
  const authors = (p.match(/\b[A-Z][a-z]+(?:-[A-Z][a-z]+)? [A-Z]{1,3}\b[,.]/g) ?? []).length
  return numberedAuthors >= 2 || (journalRefs >= 2 && authors >= 2)
}

/**
 * The text with its reference list removed: everything after a References
 * heading that reads as a bibliography, plus any paragraph anywhere that
 * looks like a bibliography entry.
 */
export function stripReferenceSection(text: string): string {
  const lines = text.split('\n')
  let cutAt = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (
      !/^\s*(?:#+\s*)?(?:\d+\.?\s*)?(?:references|bibliography|literature cited|works cited|reference list)\s*:?\s*$/i
        .test(lines[i]!)
    ) continue
    const following = lines.slice(i + 1, i + 25).map((l) => l.trim()).filter((l) => l.length > 0)
    const entries = following.filter(looksLikeBibliographyEntry).length
    if (entries >= 2 || (following.length > 0 && entries / following.length >= 0.3)) {
      cutAt = i
      break
    }
  }
  return lines
    .slice(0, cutAt)
    .filter((line) => !looksLikeBibliographyEntry(line))
    .join('\n')
}

// ---------------------------------------------------------------------------
// Sentence splitting that keeps each sentence's markers with it
// ---------------------------------------------------------------------------

const MARKER = /\[(\d{1,3})\]/g

function markersIn(text: string): number[] {
  return [...text.matchAll(MARKER)].map((m) => Number(m[1]))
}

/** Splits one paragraph line into sentences, each keeping the markers that follow it. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let start = 0
  const re = /[.!?]["'”)]*(?:\s*\[\d{1,3}\])*(?=\s+(?:[A-Z0-9("'“*]|\d))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length
    const before = text.slice(start, m.index)
    if (ABBREVIATION.test(before.trimEnd())) continue
    out.push(text.slice(start, end).trim())
    start = end
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out.filter((s) => s.length > 0)
}

/** The safety variant's mandated closing line: advice, never a cited claim. */
const BOILERPLATE = /verify against current prescribing information/i

function isHeading(line: string): boolean {
  return /^\s*#{1,6}\s/.test(line) ||
    /^\s*(?:\*\*|__)[^*_]+(?:\*\*|__)\s*:?\s*(?:\[\d{1,3}\]\s*)*$/.test(line)
}

const LIST_PREFIX = /^(\s*(?:[-*•]|\d{1,3}[.)])\s+)/

// ---------------------------------------------------------------------------
// The binding pass
// ---------------------------------------------------------------------------

export interface BoundSentence {
  /** The sentence without markers. */
  text: string
  /** Citation indices (after renumbering) the sentence is bound to. */
  bound: number[]
  /** Which line of the answer the sentence sits on (an index into `layout`). */
  line: number
}

/** One line of the bound answer: a run of sentences with its list prefix, or a line kept as is. */
export type BoundLine = { kind: 'raw'; text: string } | {
  kind: 'sentences'
  prefix: string
  /** Indices into `sentences`. */
  sentences: number[]
}

export interface BindInput {
  text: string
  citations: readonly Citation[]
  /** Extracted text per citation index (the provider's numbering), reference list already removed. */
  texts: ReadonlyMap<number, string>
  lexicon?: readonly string[]
  /** Citation indices that failed the display floor: their markers are dropped outright. */
  belowFloor?: ReadonlySet<number>
  /** Names the question uses (lower-cased): a sentence naming one binds only to a text that carries it. */
  questionEntities?: readonly string[]
  /**
   * A name every cited text must carry to be bound at all (the study the
   * question names, "SANAD"): a citation whose text and title both lack it
   * is dropped, so a tau-pathology paper never carries a SANAD sentence.
   */
  requiredName?: string
  /**
   * Keep the provider's citation numbers rather than renumbering by first
   * appearance, for a caller that renumbers once more after its own pass
   * (the figure gate) and needs one numbering throughout.
   */
  keepNumbering?: boolean
}

export interface BindResult {
  text: string
  /** The citations that kept at least one marker, renumbered in order of first appearance. */
  citations: Citation[]
  sentences: BoundSentence[]
  /** The answer's lines, so a caller can drop or re-mark sentences and render the text again. */
  layout: BoundLine[]
  /** Citation indices (the provider's numbering) that passed the floor and the name check, bound or not. */
  usable: number[]
  /**
   * Citation indices that passed the name check whatever their score: a
   * text the platform cited that verifiably carries a sentence's figures
   * beside the claim may still lend it a marker.
   */
  named: number[]
  /** Markers removed because nothing supported them. */
  dropped: number
  /** Markers moved to a different citation than the model or platform placed. */
  rebound: number
}

export function bindSentences(input: BindInput): BindResult {
  const lexicon = input.lexicon ?? []
  const prepared = new Map<number, PreparedText>()
  for (const [index, text] of input.texts) prepared.set(index, prepareText(text))
  const allPrepared = [...prepared.values()]
  const known = new Set(input.citations.map((c) => c.index))
  const required = input.requiredName?.toLowerCase()
  const carriesName = (index: number): boolean => {
    if (!required) return true
    const text = prepared.get(index)
    if (
      text &&
      new RegExp(`\\b${required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(text.lower)
    ) {
      return true
    }
    const title = input.citations.find((c) => c.index === index)?.title ?? ''
    return new RegExp(`\\b${required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title)
  }
  const usable = (index: number) =>
    known.has(index) && !(input.belowFloor?.has(index) ?? false) && carriesName(index)

  let dropped = 0
  let rebound = 0
  const sentencesOut: { text: string; bound: number[]; line: number }[] = []
  const lines = input.text.split('\n')
  const layout: BoundLine[] = []

  for (const line of lines) {
    if (!line.trim()) {
      layout.push({ kind: 'raw', text: line })
      continue
    }
    if (isHeading(line)) {
      const own = markersIn(line)
      dropped += own.length
      layout.push({ kind: 'raw', text: line.replace(/\s*\[\d{1,3}\]/g, '').trimEnd() })
      continue
    }
    const prefix = LIST_PREFIX.exec(line)?.[1] ?? ''
    const body = line.slice(prefix.length)
    const sentences = splitSentences(body)
    if (sentences.length === 0) {
      layout.push({ kind: 'raw', text: line })
      continue
    }
    // Markers at the end of the paragraph are the platform's block-level
    // spray: candidates for every sentence in the block, owned by none.
    const last = sentences[sentences.length - 1]!
    const tailMarkers = markersIn(/((?:\s*\[\d{1,3}\])+)\s*$/.exec(last)?.[1] ?? '')
    const outSentences: number[] = []
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i]!
      const isLast = i === sentences.length - 1
      const ownAll = markersIn(sentence)
      const own = isLast && sentences.length > 1
        ? ownAll.slice(0, ownAll.length - tailMarkers.length)
        : ownAll
      const plain = sentence.replace(/\s*\[\d{1,3}\]/g, '').trim()
      const features = sentenceFeatures(plain, lexicon, input.questionEntities ?? [])
      const rare = rareWords(features.words, allPrepared)
      const candidates = BOILERPLATE.test(plain)
        ? []
        : [...new Set([...own, ...(sentences.length > 1 ? tailMarkers : [])])].filter(usable)
      const score = (index: number): number => {
        const text = prepared.get(index)
        // A citation whose text could not be fetched is unverifiable: it
        // keeps a marker the sentence already had, never gains one.
        if (!text) return own.includes(index) ? 0.5 : 0
        return supportScore(features, text, rare)
      }
      let supporters = candidates.map((index) => ({ index, score: score(index) }))
        .filter((s) => s.score > 0)
      // Only a sentence with a figure or a named entity can gain a marker it
      // did not have: boilerplate ("verify against prescribing information")
      // matches every drug paper's vocabulary and must never be cited.
      const verifiable = features.numbers.length > 0 || features.entities.length > 0
      if (supporters.length === 0 && verifiable) {
        // Nothing the block cited supports this sentence - look across every
        // citation the answer made, and bind only to a clear match.
        supporters = input.citations
          .filter((c) => usable(c.index) && !candidates.includes(c.index))
          .map((c) => ({ index: c.index, score: score(c.index) }))
          .filter((s) => s.score >= 0.6)
        if (supporters.length > 0) rebound += 1
      }
      supporters.sort((a, b) => b.score - a.score || a.index - b.index)
      const bound = supporters.slice(0, 3).map((s) => s.index).sort((a, b) => a - b)
      const lost = new Set(
        [...own, ...(isLast ? tailMarkers : [])].filter((n) => !bound.includes(n)),
      )
      dropped += lost.size
      outSentences.push(sentencesOut.length)
      sentencesOut.push({ text: plain, bound, line: layout.length })
    }
    layout.push({ kind: 'sentences', prefix, sentences: outSentences })
  }

  // Renumber by first appearance in the bound text.
  const order: number[] = []
  for (const s of sentencesOut) for (const n of s.bound) if (!order.includes(n)) order.push(n)
  const renumber = new Map(
    order.map((old, i) => [old, input.keepNumbering ? old : i + 1]),
  )
  const citations = order.map((old) => {
    const source = input.citations.find((c) => c.index === old)!
    return { ...source, index: renumber.get(old)! }
  })
  const sentences = sentencesOut.map((s) => ({
    text: s.text,
    bound: s.bound.map((n) => renumber.get(n)!).filter((n) => n !== undefined).sort((a, b) =>
      a - b
    ),
    line: s.line,
  }))
  return {
    text: renderBound(layout, sentences),
    citations,
    sentences,
    layout,
    usable: input.citations.map((c) => c.index).filter(usable),
    named: input.citations.map((c) => c.index).filter((i) => known.has(i) && carriesName(i)),
    dropped,
    rebound,
  }
}

/**
 * The answer text from its layout: each sentence followed by its markers in
 * ascending order, a line whose every sentence was removed dropped with it.
 */
export function renderBound(
  layout: readonly BoundLine[],
  sentences: readonly BoundSentence[],
  removed: ReadonlySet<number> = new Set(),
): string {
  const lines: string[] = []
  for (const line of layout) {
    if (line.kind === 'raw') {
      lines.push(line.text)
      continue
    }
    const kept = line.sentences.filter((i) => !removed.has(i))
    if (kept.length === 0) continue
    lines.push(
      line.prefix +
        kept.map((i) => {
          const s = sentences[i]!
          return s.bound.length > 0 ? `${s.text}${s.bound.map((n) => `[${n}]`).join('')}` : s.text
        }).join(' '),
    )
  }
  // A removed list item or paragraph never leaves a double blank line behind.
  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}
