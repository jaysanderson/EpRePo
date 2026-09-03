/**
 * Whether a matched passage actually tells the reader anything.
 *
 * A place-name or single-term query often matches a bare heading or a list of
 * state names, so the passage comes back as the query echoed ("Western
 * Australia South Australia Victoria") or as punctuation noise. Quoting that
 * under a result is worse than quoting nothing.
 */
export function passageIsInformative(passage: string, query: string): boolean {
  const words = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)

  const passageWords = words(passage)
  if (passageWords.length === 0) return false

  const queryWords = new Set(words(query))
  const beyondQuery = passageWords.filter((word) => !queryWords.has(word))

  // Nothing but the query terms echoed back, however many times.
  if (beyondQuery.length === 0) return false
  // A couple of stray words either side of the query is still not a sentence.
  return beyondQuery.length >= 4
}

/** Lowercase, letters and digits only - for comparing a snippet with a summary. */
function skeleton(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Whether a matched passage merely repeats the card's summary (an abstract
 * stored as the summary is often exactly the paragraph retrieval matched).
 * One contained in the other, or sharing most of its words, counts as the same.
 */
export function passageRepeatsSummary(passage: string, summary: string): boolean {
  const a = skeleton(passage)
  const b = skeleton(summary)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  const words = new Set(a.split(' '))
  const shared = b.split(' ').filter((w) => words.has(w)).length
  return shared / Math.max(1, b.split(' ').length) > 0.8
}

/**
 * Strip title-page boilerplate from a snippet: correspondence emails, and
 * "Correspondence"/"Funding information" runs that a journal PDF's first page
 * carries. A snippet that is nothing but boilerplate becomes empty.
 */
export function scrubSnippetBoilerplate(passage: string): string {
  return passage
    .replace(/\b(?:e-?mail|email)\s*:?\s*\S+@\S+/gi, '')
    .replace(/\S+@\S+\.[a-z]{2,}/gi, '')
    .replace(
      /\b(?:correspondence|funding information|funding statement|conflict of interest|competing interests)\b\s*:?.*$/gi,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim()
}
