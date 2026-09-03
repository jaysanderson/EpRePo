/**
 * Stage 1 of intent routing: deterministic, explainable, free. Pure functions
 * over the tenant's intents so they never need the platform. Stage 2 (the
 * classifier) lives in the provider; the threshold logic that accepts or
 * rejects its answer is here so both stages share one decision shape.
 * See docs/INTENT-ROUTING.md.
 */
import type { Intent, RouteDecision } from '@research-portal/core'

export const CLASSIFIER_THRESHOLD = 0.6

export function configurationFor(intentId: string, defaultIntent: string): string {
  return intentId === defaultIntent ? 'portal-ask' : `portal-intent-${intentId}`
}

/** Gene symbols (SCN1A, KCNQ2, DEPDC5) and any term in the tenant's lexicon. */
export function extractEntities(query: string, lexicon: readonly string[] = []): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const add = (term: string) => {
    const key = term.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      found.push(term)
    }
  }
  for (const m of query.match(/\b[A-Z][A-Z0-9]{2,7}\b/g) ?? []) {
    if (!/^(PMC|DOI|EEG|MRI|PET|ASM|ASMS|RCT|ILAE|HR|CI|OR|RR)\d*$/.test(m)) add(m)
  }
  const lower = query.toLowerCase()
  for (const term of lexicon) {
    const t = term.toLowerCase()
    if (
      t.length >= 4 && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)
    ) {
      add(term)
    }
  }
  return found
}

/** Replace `{entities}` and `{query}` in an intent's prequery templates. */
export function fillPrequeries(
  templates: readonly string[],
  query: string,
  entities: readonly string[],
): string[] {
  const subject = entities.length > 0 ? entities.join(', ') : query
  return templates
    .map((t) => t.replaceAll('{entities}', subject).replaceAll('{query}', query).trim())
    .filter((t) => t.length > 3)
}

export interface RouteContext {
  intents: readonly Intent[]
  defaultIntent: string
  lexicon?: readonly string[]
  /** The surface asking: an intent that cannot serve it (search-only on Ask) is never chosen. */
  surface?: 'ask' | 'search'
}

/** Intents that can serve the context's surface. */
export function eligibleIntents(ctx: RouteContext): Intent[] {
  const surface = ctx.surface
  return ctx.intents.filter((i) =>
    !surface || i.answer.surfaces.includes(surface) || i.id === ctx.defaultIntent
  )
}

/** First intent whose rule matches; null when no rule fires. */
export function routeByRules(query: string, ctx: RouteContext): RouteDecision | null {
  const q = query.trim()
  if (!q) return null
  const entities = extractEntities(q, ctx.lexicon ?? [])
  for (const intent of eligibleIntents(ctx)) {
    for (const rule of intent.rules) {
      let re: RegExp
      try {
        re = new RegExp(rule, 'i')
      } catch {
        continue
      }
      if (!re.test(q)) continue
      if (intent.requireEntity && entities.length === 0) continue
      return {
        intent: intent.id,
        confidence: 1,
        stage: 'rule',
        rationale: describeRule(intent, entities),
        configuration: configurationFor(intent.id, ctx.defaultIntent),
        entities,
        rule,
      }
    }
  }
  return null
}

function describeRule(intent: Intent, entities: string[]): string {
  const who = entities.length > 0 ? ` (${entities.slice(0, 3).join(', ')})` : ''
  return `${intent.label}: matched a routing rule${who}`
}

/** The default decision when nothing fires or the classifier is unsure. */
export function defaultDecision(
  ctx: RouteContext,
  rationale: string,
  entities: string[] = [],
): RouteDecision {
  return {
    intent: ctx.defaultIntent,
    confidence: 0,
    stage: 'default',
    rationale,
    configuration: configurationFor(ctx.defaultIntent, ctx.defaultIntent),
    entities,
  }
}

/** Accept the classifier's answer only when it names a known intent with enough confidence. */
export function decideFromClassifier(
  raw: { intent?: unknown; confidence?: unknown; rationale?: unknown },
  ctx: RouteContext,
  entities: string[] = [],
  threshold = CLASSIFIER_THRESHOLD,
): RouteDecision {
  const intent = typeof raw.intent === 'string' ? raw.intent.trim() : ''
  const confidence = typeof raw.confidence === 'number'
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0
  const known = eligibleIntents(ctx).find((i) => i.id === intent)
  if (!known || confidence < threshold) {
    return defaultDecision(ctx, 'No confident match, using the default configuration', entities)
  }
  return {
    intent: known.id,
    confidence,
    stage: 'classifier',
    rationale: typeof raw.rationale === 'string' && raw.rationale.trim()
      ? raw.rationale.trim().slice(0, 200)
      : `${known.label}: classified from the question`,
    configuration: configurationFor(known.id, ctx.defaultIntent),
    entities,
  }
}

/** A manual override from the route chip. */
export function overrideDecision(
  intentId: string,
  ctx: RouteContext,
  entities: string[] = [],
): RouteDecision | null {
  const known = ctx.intents.find((i) => i.id === intentId)
  if (!known) return null
  return {
    intent: known.id,
    confidence: 1,
    stage: 'override',
    rationale: `${known.label}: chosen by the reader`,
    configuration: configurationFor(known.id, ctx.defaultIntent),
    entities,
  }
}
