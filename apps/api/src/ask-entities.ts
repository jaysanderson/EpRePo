/**
 * Per-entity grounding for a question that names several things at once
 * (docs/persona-reports/dsouza-loop2.md D2-03, D2-05, D2-08).
 *
 * A comparison ("perampanel versus brivaracetam") retrieved on the whole
 * question grounds on whichever paper the merged ranking likes, so one
 * drug's figure was read off the other drug's paper. The fix leverages the
 * platform: the routed stored configuration runs once per named entity
 * and the top paper for each joins the grounding set through its own
 * `resource_filters` prequery, before generation. A two-part question about
 * one named paper ("what are the criteria, and what proportion met them")
 * likewise runs each clause against the pinned paper, so retrieval reads
 * more of that paper before the answer declares anything absent.
 *
 * Everything here is deterministic; the only platform call is the search
 * function the caller passes in, so the module is tested with a stub.
 */
import type { ScoredResource } from '@research-portal/core'
import { isMedicationTerm } from './ask-prequeries.ts'
import { lexiconEntities } from './intent-router.ts'
import { isAttachmentTitle, studyAcronyms } from './study-guard.ts'

/** How many entities a question may ground separately. */
export const MAX_ENTITY_PINS = 3

/**
 * The clauses of a multi-part question, each a standalone retrieval query:
 * "What are the criteria for X, and what proportion met them?" splits at
 * the ", and what". A question with one clause yields nothing (the main
 * query already covers it); at most three clauses of four or more words.
 */
export function questionClauses(query: string): string[] {
  const parts = query
    .split(
      /\s*(?:[;?]|,?\s+and\s+(?=(?:what|how|which|whether|when|where|why|did|does|do|is|was|were|are|can|could|should|who)\b))\s*/i,
    )
    .map((p) => p.trim().replace(/[?.]+$/, '').trim())
    .filter((p) => p.split(/\s+/).length >= 4)
  return parts.length >= 2 ? parts.slice(0, 3) : []
}

/**
 * The drugs and studies a question names, in order: medication terms from
 * the lexicon and study acronyms. Two or more make the question a
 * comparison that grounds per entity.
 */
export function comparisonEntities(query: string, lexicon: readonly string[]): string[] {
  const out: string[] = []
  const add = (e: string) => {
    if (!out.some((x) => x.toLowerCase() === e.toLowerCase())) out.push(e)
  }
  for (const term of lexiconEntities(query, lexicon)) if (isMedicationTerm(term)) add(term)
  for (const acronym of studyAcronyms(query)) add(acronym)
  return out
}

/**
 * The retrieval text for one entity: the question with the other entities
 * removed and the entity itself repeated at the front, so the stored
 * configuration ranks that entity's own papers first.
 */
export function entityQuery(query: string, entity: string, others: readonly string[]): string {
  let text = query
  for (const other of others) {
    if (other.toLowerCase() === entity.toLowerCase()) continue
    text = text.replace(
      new RegExp(
        `\\b(?:adjunctive\\s+|versus\\s+|vs\\.?\\s+|or\\s+|and\\s+)?${escape(other)}\\b`,
        'gi',
      ),
      ' ',
    )
  }
  return `${entity}: ${text.replace(/\s+/g, ' ').trim()}`
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whether a resource's title or matched passage names the entity. */
export function mentionsEntity(
  resource: Pick<ScoredResource, 'title' | 'matchedPassage'>,
  entity: string,
): boolean {
  const word = new RegExp(`(?:^|[^a-z0-9])${escape(entity.toLowerCase())}(?=$|[^a-z0-9])`)
  return word.test(resource.title.toLowerCase()) ||
    word.test((resource.matchedPassage ?? '').toLowerCase())
}

/**
 * The paper to ground an entity on: the first retrieved article (never an
 * attachment) whose title or passage names the entity. The title is
 * preferred over the passage so "PERMIT study: ... perampanel" beats a
 * brivaracetam paper whose passage mentions perampanel in passing.
 */
export function pickEntityPaper(
  results: readonly ScoredResource[],
  entity: string,
): ScoredResource | undefined {
  const articles = results.filter((r) => !isAttachmentTitle(r.title) && !r.referenceChunk)
  const word = new RegExp(`(?:^|[^a-z0-9])${escape(entity.toLowerCase())}(?=$|[^a-z0-9])`)
  return articles.find((r) => word.test(r.title.toLowerCase())) ??
    articles.find((r) => mentionsEntity(r, entity))
}

export interface EntityPin {
  entity: string
  id: string
  title: string
  /** The retrieved paper itself, for the sources rail. */
  paper: ScoredResource
}

/**
 * One retrieval per named entity on the routed configuration, merged into
 * a list of papers to pin. Entities a pinned paper's title already names
 * are skipped (the study guard has them). Failures leave the entity
 * unpinned rather than failing the ask.
 */
export async function entityPins(
  query: string,
  entities: readonly string[],
  alreadyPinned: readonly { id: string; title: string }[],
  search: (text: string) => Promise<readonly ScoredResource[]>,
): Promise<EntityPin[]> {
  if (entities.length < 2) return []
  const wanted = entities.filter((e) =>
    !alreadyPinned.some((p) => mentionsEntity({ title: p.title }, e))
  ).slice(0, MAX_ENTITY_PINS)
  const found = await Promise.all(
    wanted.map(async (entity) => {
      try {
        const results = await search(entityQuery(query, entity, entities))
        const paper = pickEntityPaper(results, entity)
        return paper ? { entity, id: paper.id, title: paper.title, paper } : null
      } catch {
        return null
      }
    }),
  )
  const out: EntityPin[] = []
  for (const pin of found) {
    if (pin && !out.some((p) => p.id === pin.id) && !alreadyPinned.some((p) => p.id === pin.id)) {
      out.push(pin)
    }
  }
  return out
}

/**
 * A conference abstract collection or meeting proceedings: never a "closest
 * match" worth naming in a decline (D2-10). Matched on the title, as the
 * kind rules have no such kind.
 */
export function isConferenceTitle(title: string): boolean {
  return /\b(?:\d+(?:st|nd|rd|th)\s+(?:[\w-]+\s+){0,5}(?:meeting|congress|conference|symposium)|annual meeting|meeting:\s*part|proceedings of|abstracts? (?:of|from) the|congress of|conference on)\b/i
    .test(title)
}

/** Words that make a question about animal or model work, where a preclinical paper fits. */
const ANIMAL = /\b(?:rat|rats|mouse|mice|rodent|animal|model|models|in vitro|in vivo|zebrafish)\b/i

/**
 * The closest matches to name in a decline, from the semantic ranking
 * with a topic check: a paper whose title or summary carries more of the
 * question's content words moves up, and a preclinical paper is never a
 * close match for a question about people. Returns the resources with
 * their ranking score, best first.
 */
export function rankClosest<
  T extends { title: string; summary?: string; kind?: string; relevance: number },
>(
  resources: readonly T[],
  query: string,
): T[] {
  const words = new Set(
    (query.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []).map((w) => w.slice(0, 6)).filter((w) =>
      !CLOSEST_STOP.has(w)
    ),
  )
  const human = !ANIMAL.test(query)
  return resources
    .filter((r) => !(human && r.kind === 'preclinical'))
    .map((r) => {
      const have = new Set(
        (`${r.title} ${r.summary ?? ''}`.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []).map((w) =>
          w.slice(0, 6)
        ),
      )
      let hits = 0
      for (const w of words) if (have.has(w)) hits++
      return { r, score: r.relevance + hits * 0.1 }
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r)
}

const CLOSEST_STOP = new Set(['which', 'there', 'their', 'about', 'these', 'those', 'where'])

/**
 * The prompt addendum for an ask with pinned papers: answer from them,
 * name a figure or table when the text holds the sample but not the
 * outcome, and never declare absent what the supplied passages contain.
 */
export function pinnedAddendum(titles: readonly string[]): string {
  const named = titles.slice(0, 3).map((t) => `"${t}"`).join(', ')
  return `The sources include the paper${
    titles.length === 1 ? '' : 's'
  } the question names: ${named}. ` +
    'Answer from that paper first and report what its text states, with the sample or subgroup ' +
    'size beside each proportion. When the paper gives the sample or subgroup sizes in its text ' +
    'but reports the outcome only in a figure or table, say exactly that and name the figure or ' +
    'table; answer the part the text does answer rather than declining. Never say the sources ' +
    'do not detail something that the supplied passages of that paper contain, and never ' +
    'attribute a figure from a different paper to the named study.'
}
