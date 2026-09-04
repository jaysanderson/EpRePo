/**
 * Section-aware reading of an extracted paper (docs/persona-reports/
 * dsouza-loop2.md D2-06, D2-14). The platform's extraction keeps the
 * section headings of a journal article ("Abstract", "1 | INTRODUCTION",
 * "3 Results", "Discussion", "References"), so a paragraph can be placed in
 * its section and a figure the answer states can be checked for where in
 * the cited paper it appears. A figure that occurs only in the introduction
 * or the discussion is the paper quoting earlier literature, not its own
 * finding, and the reader is told so in one sentence.
 */

export type Section =
  | 'abstract'
  | 'introduction'
  | 'methods'
  | 'results'
  | 'discussion'
  | 'conclusion'
  | 'references'
  | 'other'

export interface SectionSpan {
  section: Section
  start: number
  end: number
}

const HEADING =
  /(?:^|\n)[ \t]*(?:\d{1,2}(?:\.\d{1,2})*[ \t]*\|?[ \t]*)?(abstract|summary|introduction|background|(?:materials?,? (?:and|&) )?methods?|(?:patients|participants|subjects) and methods|methodology|results|findings|discussion|conclusions?|references|bibliography|acknowledg(?:e)?ments?|supplementary (?:material|information))\b[ \t]*(?::|\||\n|$)/gi

function canonical(heading: string): Section {
  const h = heading.toLowerCase()
  if (h.startsWith('abstract') || h === 'summary') return 'abstract'
  if (h.startsWith('introduction') || h.startsWith('background')) return 'introduction'
  if (/method|patients and|participants and|subjects and/.test(h)) return 'methods'
  if (h.startsWith('results') || h.startsWith('findings')) return 'results'
  if (h.startsWith('discussion')) return 'discussion'
  if (h.startsWith('conclusion')) return 'conclusion'
  return 'references'
}

/**
 * The sections of an extracted text, in order, from its headings. Text
 * before the first heading is `other` (masthead, title, authors). A
 * structured abstract's own "Methods:" and "Results:" lines are part of the
 * abstract: a heading that follows a colon-style abstract heading within
 * 2,500 characters and before any body "Introduction" stays abstract.
 */
export function sectionSpans(text: string): SectionSpan[] {
  const marks: { section: Section; at: number }[] = []
  for (const m of text.matchAll(HEADING)) {
    const at = (m.index ?? 0) + (m[0].startsWith('\n') ? 1 : 0)
    marks.push({ section: canonical(m[1]!), at })
  }
  const spans: SectionSpan[] = []
  let cursor = 0
  let current: Section = 'other'
  let abstractAt = -1
  let bodyStarted = false
  for (const mark of marks) {
    let section = mark.section
    if (section === 'abstract') abstractAt = mark.at
    if (section === 'introduction') bodyStarted = true
    // A structured abstract's sub-headings stay within the abstract.
    if (
      !bodyStarted && abstractAt >= 0 && mark.at - abstractAt < 2500 &&
      (section === 'methods' || section === 'results' || section === 'conclusion' ||
        section === 'discussion')
    ) {
      section = 'abstract'
    }
    if (section === current) continue
    if (mark.at > cursor) spans.push({ section: current, start: cursor, end: mark.at })
    cursor = mark.at
    current = section
  }
  if (text.length > cursor) spans.push({ section: current, start: cursor, end: text.length })
  return spans
}

/** The section an offset into the text falls in. */
export function sectionAt(spans: readonly SectionSpan[], offset: number): Section {
  for (const span of spans) if (offset >= span.start && offset < span.end) return span.section
  return 'other'
}

/** Whether the text carries any body heading at all (otherwise nothing can be excluded). */
export function hasBodyHeadings(spans: readonly SectionSpan[]): boolean {
  return spans.some((s) => s.section === 'results' || s.section === 'introduction')
}

/**
 * Offsets of every occurrence of a figure in the text, as a whole number.
 * A thousands separator in the text ("2,698") still matches "2698"; the
 * text itself is not rewritten, so offsets line up with the section spans.
 */
export function figureOffsets(figure: string, text: string): number[] {
  const bare = figure.replace(/[%\s,]/g, '')
  if (!bare || !/\d/.test(bare)) return []
  const body = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/(\d)(?=\d)/g, '$1,?')
  const pattern = new RegExp(`(?<![\\d.,])${body}(?![\\d])`, 'g')
  const out: number[] = []
  for (const m of text.matchAll(pattern)) out.push(m.index ?? 0)
  return out
}

/** Sections where a paper's own findings live. */
const OWN: ReadonlySet<Section> = new Set(['abstract', 'methods', 'results', 'conclusion', 'other'])

export interface SecondhandFigure {
  figure: string
  /** Citation index of the paper the figure was attributed to. */
  index: number
}

/**
 * Figures the answer attributes to a cited paper that appear in that paper
 * only in its introduction or discussion, where it cites other studies.
 * A paper without body headings is never judged; a figure absent from the
 * paper altogether is the audit's business, not this check's.
 */
export function secondhandFigures(
  sentences: readonly { text: string; bound: readonly number[] }[],
  texts: ReadonlyMap<number, string>,
): SecondhandFigure[] {
  const spansByIndex = new Map<number, SectionSpan[]>()
  const spansFor = (index: number): SectionSpan[] | undefined => {
    if (!spansByIndex.has(index)) {
      const text = texts.get(index)
      spansByIndex.set(index, text ? sectionSpans(text) : [])
    }
    return spansByIndex.get(index)
  }
  const out: SecondhandFigure[] = []
  const seen = new Set<string>()
  for (const sentence of sentences) {
    const figures = sentence.text.match(/\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\b/g) ?? []
    for (const figure of figures) {
      if (/^(?:19|20)\d\d$/.test(figure) || /^\d$/.test(figure)) continue
      for (const index of sentence.bound) {
        const text = texts.get(index)
        const spans = spansFor(index)
        if (!text || !spans || !hasBodyHeadings(spans)) continue
        const offsets = figureOffsets(figure, text)
        if (offsets.length === 0) continue
        const sections = new Set(offsets.map((o) => sectionAt(spans, o)))
        if ([...sections].some((s) => OWN.has(s))) continue
        const key = `${figure}:${index}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ figure, index })
      }
    }
  }
  return out
}

/**
 * The sentences of an answer with the citation markers each carries, for
 * `secondhandFigures`. Lines without a marker contribute nothing.
 */
export function markedSentences(text: string): { text: string; bound: number[] }[] {
  const out: { text: string; bound: number[] }[] = []
  for (const line of text.split('\n')) {
    if (!/\[\d{1,3}\]/.test(line) || /^\s*\*/.test(line)) continue
    const sentences = line.split(/(?<=[.!?]["'”’)]*(?:\s*\[\d{1,3}\])*)\s+(?=[A-Z*(])/)
    for (const sentence of sentences) {
      const bound = [...sentence.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]))
      if (bound.length > 0) out.push({ text: sentence.replace(/\[\d{1,3}\]/g, ''), bound })
    }
  }
  return out
}

/** The one-line boundary note for second-hand figures, or undefined when there are none. */
export function secondhandNote(figures: readonly SecondhandFigure[]): string | undefined {
  if (figures.length === 0) return undefined
  const items = figures.slice(0, 6).map((f) => `${f.figure} [${f.index}]`).join(', ')
  return `*Second-hand figures: ${items} ${
    figures.length === 1 ? 'appears' : 'appear'
  } in the cited paper only in its introduction or discussion, where it cites other studies, ` +
    'not among its own results.*'
}
