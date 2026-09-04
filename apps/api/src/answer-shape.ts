/**
 * Shape checks on generated answer text that need no model in the loop.
 *
 * The one implemented here: a model-authored reference list. Review-style
 * prompts sometimes end an answer with "References:" followed by numbered
 * one-line descriptions ("1. Study on LITT efficacy at 12 months.") whose
 * numbering has nothing to do with the citation chips the platform binds.
 * The evidence panel is the reference list; the model's own is stripped.
 */

const HEADING =
  /(?:^|\n)[ \t]*(?:-{3,}[ \t]*\n[ \t]*)?(?:#{1,6}[ \t]*|\*\*|__)?[ \t]*(?:references?|reference list|sources?|citations?|bibliography)[ \t]*:?[ \t]*(?:\*\*|__)?[ \t]*:?[ \t]*(?=\n|$)/i

/**
 * Where a trailing model-authored reference block begins, or -1. The heading
 * must sit on its own line and be followed only by list items (numbered,
 * bulleted or bracketed) or nothing at all - a paragraph that merely
 * mentions sources is left alone.
 */
export function referenceBlockStart(text: string): number {
  let from = 0
  while (from < text.length) {
    const rest = text.slice(from)
    const m = HEADING.exec(rest)
    if (!m) return -1
    const at = from + m.index
    const after = rest.slice(m.index + m[0].length)
    const lines = after.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
    const listOnly = lines.every((l) => /^(?:\d+[.)]|[-*•]|\[\d+\])\s*/.test(l))
    if (listOnly) return at
    from = at + m[0].length
  }
  return -1
}

/** `at` moved back over a horizontal rule and blank lines that only introduced the block. */
function cutPoint(text: string, at: number): number {
  const before = text.slice(0, at)
  const trimmed = before.replace(/(?:\s*\n[ \t]*-{3,}[ \t]*)?\s*$/, '')
  return trimmed.length
}

/** The text with any trailing model-authored reference block removed. */
export function stripModelReferences(text: string): string {
  const at = referenceBlockStart(text)
  if (at === -1) return text
  return text.slice(0, cutPoint(text, at))
}

/**
 * Incremental form for a token stream: given the text emitted so far and the
 * full text accumulated, returns the slice that may still be forwarded and
 * whether forwarding must stop. Once a reference heading appears the rest
 * of the stream is withheld; the final `done` text is stripped the same way.
 */
export function forwardableSlice(
  emittedLength: number,
  full: string,
): { text: string; stop: boolean } {
  const at = referenceBlockStart(full)
  if (at === -1) return { text: full.slice(emittedLength), stop: false }
  const cut = cutPoint(full, at)
  return { text: cut > emittedLength ? full.slice(emittedLength, cut) : '', stop: true }
}
