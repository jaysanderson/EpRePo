/**
 * The one extra ask a research question may cost (D3-05). A refusal used to
 * walk a chain - the general configuration, then the default without
 * prequeries, then the pinned paper - and the provider retried once more
 * inside each, so a question the corpus does not answer took four platform
 * asks and up to 37 seconds to say so. Now a refusal buys at most one more
 * retrieval, chosen for the reason the first pass failed, and the refusal
 * is accepted when none applies.
 */
export type RetryKind = 'supplements' | 'pinned' | 'prequeries'

export interface RetryContext {
  /** Document chat never retries: the document either answers or it does not. */
  documentScope: boolean
  /** The extra ask has been spent. */
  extraAttemptUsed: boolean
  /** Papers the question names, pinned into the grounding set. */
  pinnedIds: readonly string[]
  /** Resources the failed pass cited before binding - a pinned paper among them was read already. */
  citedIds: readonly string[]
  /** The current attempt ran on a supplements-only configuration. */
  supplementsOnly: boolean
  /** The current attempt's intent, and the tenant's default intent. */
  currentIntent: string | undefined
  defaultIntent: string | undefined
  /** How many prequeries the current attempt carried. */
  prequeries: number
  /** The strongest retrieval relevance seen on the current attempt, and the cut that reads as "the generator, not the corpus, said no". */
  bestRelevance: number
  strongMatch: number
}

/**
 * Which extra ask to make, or null to accept the refusal. `refused` is the
 * generator declining outright; `uncited` is an answer whose every marker
 * the binding stripped, where only a document-scoped read of the named
 * paper can help. The pinned retry is skipped when the first pass already
 * cited the pinned paper: reading it again produces the same figures the
 * gate just rejected.
 */
export function nextRetry(ctx: RetryContext, reason: 'refused' | 'uncited'): RetryKind | null {
  if (ctx.documentScope || ctx.extraAttemptUsed) return null
  const pinnable = ctx.pinnedIds.length > 0 &&
    !ctx.pinnedIds.some((id) => ctx.citedIds.includes(id))
  if (reason === 'uncited') return pinnable ? 'pinned' : null
  // The data sheets matched on words but held no answer: the general
  // configuration is the right place to ask, whatever else applies.
  if (ctx.currentIntent && ctx.supplementsOnly) return 'supplements'
  if (pinnable) return 'pinned'
  // A strong match was retrieved and the generator still declined: the
  // prequeries or a narrower configuration crowded the grounding set.
  // Dropping the default intent with no prequeries changes nothing, so
  // that case is a refusal to accept rather than an ask to repeat.
  const narrowed = ctx.prequeries > 0 ||
    (ctx.currentIntent !== undefined && ctx.currentIntent !== ctx.defaultIntent)
  if (ctx.bestRelevance >= ctx.strongMatch && narrowed) return 'prequeries'
  return null
}

/**
 * The directive the one retry adds to the prompt: the platform's own
 * guardrail refuses over a relevant grounding set, and a firmer instruction
 * is the retry the provider used to make on its own (now folded into the
 * application's single extra ask, so the two never stack).
 */
export const RETRY_DIRECTIVE =
  'Relevant sources were retrieved for this exact question: answer directly from them, ' +
  'reporting what they state, rather than declining.'
