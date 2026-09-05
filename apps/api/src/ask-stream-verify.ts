/**
 * The first verified sentence, while the answer is still streaming (D4-08,
 * D3-05). The platform sends its answer text before its retrieval item and
 * its citations, and the audit can only bind markers once those arrive; a
 * reader meanwhile sees prose it has been told is unchecked. The papers
 * the pre-flight probe found are known seconds before generation starts,
 * so their texts are fetched while the platform retrieves and generates,
 * and the first complete sentence is checked against them the moment it
 * lands: every figure it states found beside the claim's own terms in one
 * of those papers - the same figure check the gate runs - and the surface
 * is told which paper carries it. Nothing here binds a marker or changes
 * the text; the gated answer that follows `done` still replaces it all.
 */
import { extractNumbers, verifyFigures } from './answer-audit.ts'
import { splitSentences } from './citation-binding.ts'

export interface WarmText {
  resourceId: string
  title: string
  text: string
}

export interface VerifiedSentence {
  sentence: string
  resourceId: string
  title: string
}

export interface StreamVerifierOptions {
  /** The texts fetched so far, read at check time (whatever has resolved). */
  texts: () => readonly WarmText[]
  lexicon: readonly string[]
  questionEntities: readonly string[]
  /** Names a text must carry to vouch for a sentence (the cohort or study the question names). */
  requiredNames?: readonly string[]
}

/** A sentence is judged only once the next one has begun, or the stream has ended. */
export class StreamVerifier {
  private buffer = ''
  private judged = false
  constructor(private readonly opts: StreamVerifierOptions) {}

  /** Appends streamed text; returns the first sentence's verification the first time it can be judged. */
  push(delta: string): VerifiedSentence | null {
    if (this.judged) return null
    this.buffer += delta
    const sentences = splitSentences(this.buffer.replace(/^\s*#{1,6}\s[^\n]*\n/, ''))
    if (sentences.length < 2) return null
    return this.judge(sentences[0]!)
  }

  /** The stream has ended: judge the first sentence if it was never followed by another. */
  flush(): VerifiedSentence | null {
    if (this.judged) return null
    const sentences = splitSentences(this.buffer.replace(/^\s*#{1,6}\s[^\n]*\n/, ''))
    if (sentences.length === 0) return null
    return this.judge(sentences[0]!)
  }

  private judge(raw: string): VerifiedSentence | null {
    this.judged = true
    return verifyFirstSentence(raw, this.opts)
  }
}

/**
 * Whether one of the warm texts carries every figure of the sentence beside
 * the claim, and which. A sentence with no figure is not judged here: the
 * marker check needs the citations. A text must carry one of the required
 * names (the question's cohort) in its title or body, as the gate demands.
 */
export function verifyFirstSentence(
  raw: string,
  opts: StreamVerifierOptions,
): VerifiedSentence | null {
  const sentence = raw.replace(/\s*\[\d{1,3}\]/g, '').replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s+/, '')
    .trim()
  if (!sentence || extractNumbers(sentence).length === 0) return null
  const required = (opts.requiredNames ?? []).map((n) => n.toLowerCase()).filter(Boolean)
  const candidates = opts.texts().filter((t) =>
    required.length === 0 ||
    required.some((name) => `${t.title}\n${t.text}`.toLowerCase().includes(name))
  )
  if (candidates.length === 0) return null
  const texts = candidates.map((t) => t.text)
  const checks = verifyFigures(
    [{ text: sentence, texts }],
    texts,
    opts.lexicon,
    opts.questionEntities,
  )
  if (checks.length === 0 || checks.some((c) => !c.supported)) return null
  const common = checks
    .map((c) => new Set(c.supportedBy))
    .reduce<Set<number> | null>(
      (acc, set) => acc === null ? set : new Set([...acc].filter((n) => set.has(n))),
      null,
    )
  const first = common ? [...common].sort((a, b) => a - b)[0] : undefined
  if (first === undefined) return null
  const found = candidates[first]
  if (!found) return null
  return { sentence, resourceId: found.resourceId, title: found.title }
}
