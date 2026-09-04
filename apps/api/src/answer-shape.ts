/**
 * Shape checks on generated answer text that need no model in the loop.
 *
 * Two live here. A model-authored reference list: review-style prompts
 * sometimes end an answer with "References:" followed by numbered one-line
 * descriptions ("1. Study on LITT efficacy at 12 months.") whose numbering
 * has nothing to do with the citation chips the platform binds. The
 * evidence panel is the reference list; the model's own is stripped.
 *
 * And the sentinel phrases the generation prompt and the platform's guardrail
 * leak into prose - "the context does not provide", "Not enough data to
 * answer this", "[inference]" - which a reader should never see verbatim.
 * They are rewritten into the portal's own voice (`rewriteSentinels`), on
 * the streamed deltas as well as the final text (`SentinelStream`).
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
  // A trailing run of "[n] Title." lines is a reference list even without a
  // heading: bracketed entries are never prose, while a numbered list only
  // counts under a heading (numbered items are how the model structures a
  // real answer).
  const trailing = /(?:^|\n)((?:[ \t]*\[\d{1,3}\][ \t]+\S[^\n]*(?:\n|$))+)\s*$/.exec(text)
  if (trailing && trailing.index >= 0) {
    const at = trailing.index + (text[trailing.index] === '\n' ? 0 : 0)
    const headed = headedBlockStart(text.slice(0, at))
    return headed === -1 ? at : headed
  }
  return headedBlockStart(text)
}

function headedBlockStart(text: string): number {
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
 * whether forwarding is currently held at a reference heading. The hold is
 * not sticky: a line that looked like a heading at a chunk boundary
 * ("Sources" as the first word of a sentence) releases again once the next
 * chunk shows it was prose. The final `done` text is stripped the same way.
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

// ---------------------------------------------------------------------------
// Sentinel phrases
// ---------------------------------------------------------------------------

/** The platform's guardrail sentence and the prompt's own coverage line, as whole sentences. */
const TEMPLATE_SENTENCE =
  /(?:^|(?<=\s))["'“(]?(?:not enough (?:data|information|context) to (?:answer|confirm|determine|say|assess|establish)[^.!?\n]*|if you need more information,? the portal'?s sources do not cover (?:it|this|that)[^.!?\n]*)[.!?]?["'”)]?/gi

/** Verb agreement once "the context" (singular) becomes "the cited sources" (plural). */
const SINGULAR_VERBS: Record<string, string> = {
  'does not': 'do not',
  "doesn't": 'do not',
  does: 'do',
  is: 'are',
  "isn't": 'are not',
  has: 'have',
  was: 'were',
  'has not': 'have not',
  "hasn't": 'have not',
}

const THIRD_PERSON =
  /^(provide|indicate|mention|state|include|contain|describe|suggest|report|show|lack|specify|offer|give|say|note|discuss|highlight|identify|present|refer|explain|address|cover|support|confirm|imply|appear|seem|detail|outline|list|emphasise|emphasize|focus|establish|demonstrate|reveal|clarify)(e?s)$/i

/**
 * Rewrites the sentinel phrases a reader should never see. "[inference]"
 * becomes the "(inference)" hedge the surfaces style; "the context" becomes
 * "the cited sources" with its verb made plural; the platform's "Not enough
 * data to answer this" and the prompt's "If you need more information, the
 * portal's sources do not cover it" are removed as sentences. A text that is
 * nothing but those sentences comes back empty, which the caller turns into
 * the portal's own decline.
 */
export function rewriteSentinels(text: string): string {
  let out = text.replace(/\[inference\]/gi, '(inference)')
  out = out.replace(TEMPLATE_SENTENCE, '')
  out = out.replace(
    /\b(the|this|that|in the|from the|within the|per the|by the|of the)\s+(?:provided\s+|given\s+|available\s+|supplied\s+|retrieved\s+)?context\b(\s+)((?:does not|doesn't|has not|hasn't|isn't|does|is|has|was)\b|[a-z]+)?/gi,
    (_m, lead: string, gap: string, verb: string | undefined) => {
      const noun = `${lead} cited sources`
      if (!verb) return noun + gap
      const lower = verb.toLowerCase()
      if (SINGULAR_VERBS[lower]) return `${noun}${gap}${SINGULAR_VERBS[lower]}`
      const third = THIRD_PERSON.exec(lower)
      if (third) return `${noun}${gap}${third[1]}`
      return `${noun}${gap}${verb}`
    },
  )
  // A sentence that was removed leaves doubled spaces or an orphaned line.
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\n[ \t]+\n/g, '\n\n').replace(/\n{3,}/g, '\n\n')
  return out.trim()
}

/**
 * Streaming form of `rewriteSentinels`: text is released only up to the last
 * sentence or line boundary, so a phrase that straddles two chunks is still
 * seen whole. `flush` releases the remainder at the end of the stream. The
 * final `done` text is rewritten separately and replaces what streamed.
 */
export class SentinelStream {
  private pending = ''

  push(chunk: string): string {
    this.pending += chunk
    // Release through the last boundary that leaves something pending: the
    // tail of a sentence is where a template sentence would still be growing.
    let cut = -1
    const re = /[.!?:](?=["'”)]?\s)|\n/g
    let m: RegExpExecArray | null
    while ((m = re.exec(this.pending)) !== null) {
      const end = m.index + m[0].length + 1
      if (end < this.pending.length) cut = end
    }
    if (cut <= 0) return ''
    const out = this.pending.slice(0, cut)
    this.pending = this.pending.slice(cut)
    return rewriteChunk(out)
  }

  flush(): string {
    const out = rewriteChunk(this.pending)
    this.pending = ''
    return out
  }
}

/** `rewriteSentinels` without the trim, so streamed chunks keep their joins. */
function rewriteChunk(chunk: string): string {
  if (!chunk) return ''
  const leading = /^\s*/.exec(chunk)?.[0] ?? ''
  const trailing = /\s*$/.exec(chunk)?.[0] ?? ''
  const core = rewriteSentinels(chunk)
  if (!core) return trailing.includes('\n') ? trailing : ''
  return leading + core + trailing
}

// ---------------------------------------------------------------------------
// The portal's own decline copy
// ---------------------------------------------------------------------------

/**
 * Whether streamed text is one of the fixed decline strings the retrieval
 * provider substitutes for a guardrail refusal. Held back by the ask handler,
 * which composes the decline itself once it knows the nearest matches.
 */
export function looksLikeProviderDecline(text: string): boolean {
  return /^\s*(this portal's content does not hold enough relevant material|the help documentation does not cover this yet)/i
    .test(text)
}

/**
 * The corpus-wide decline, naming the closest resources retrieval found so
 * the reader learns what the corpus does hold rather than hitting a dead end.
 */
export function corpusDecline(
  nearestTitles: readonly string[],
  bestMatchPct?: number,
): string {
  const titles = nearestTitles.map((t) => t.trim()).filter((t) => t.length > 0).slice(0, 3)
  const strength = typeof bestMatchPct === 'number'
    ? ` The closest passages found were only weakly related (best match ${
      Math.round(bestMatchPct)
    }%).`
    : ''
  const lead = "This portal's sources do not answer this question directly, so no answer has " +
    `been generated.${strength}`
  const nearest = titles.length > 0
    ? ` The closest matches in the corpus are ${
      titles.map((t) => `*${t}*`).join(titles.length === 2 ? ' and ' : ', ')
    } - listed below but not used.`
    : ''
  return `${lead}${nearest} Try narrowing the question to what the corpus covers, or browse ` +
    'the Library to see what it holds.'
}

/** The single-document decline for document chat - never the corpus-wide copy. */
export function documentDecline(): string {
  return 'This document does not state an answer to that question. Ask about something it ' +
    'covers - its methods, findings or limitations - or search the whole corpus instead.'
}
