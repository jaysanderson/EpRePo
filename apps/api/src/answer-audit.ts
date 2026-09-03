/**
 * Post-answer grounding audit for the safety-critical intents: figures in the
 * answer must appear in the cited material, and drugs the cited sources name
 * as contraindicated must not be silently dropped. Deterministic string
 * checks over the extracted text of the cited resources - no model in the
 * loop - so the addendum is itself grounded.
 */

/** Numbers worth checking: percentages, decimals, doses; not citation markers, list numbers or years. */
export function extractNumbers(answer: string): string[] {
  const cleaned = answer
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, ' ') // citation markers
    .replace(/^\s*\d+\.\s+/gm, ' ') // ordered-list numbers
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
  return text.replace(/\s+/g, ' ').replace(/,(?=\d{3}\b)/g, '')
}

/** Figures in the answer that appear in none of the cited texts. */
export function numbersMissing(answer: string, citedTexts: readonly string[]): string[] {
  const haystack = citedTexts.map(normaliseText).join('\n')
  return extractNumbers(answer).filter((token) => {
    const value = token.replace(/%|mg.*$/, '')
    const re = new RegExp(`(?<![\\d.])${value.replace('.', '\\.')}(?![\\d])`)
    return !re.test(haystack)
  })
}

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

/** The Markdown addendum appended to an answer, or '' when nothing to add. */
export function auditAddendum(
  input: { missingDrugs: { drug: string; index: number }[]; missingNumbers: string[] },
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
      `*Figures in this answer that do not appear in the cited passages: ${
        input.missingNumbers.join(', ')
      }. Verify against the sources before relying on them.*`,
    )
  }
  return parts.length > 0 ? `\n\n${parts.join('\n\n')}` : ''
}
