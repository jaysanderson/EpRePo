/**
 * Author-aware answers. A question that names an author the catalogue knows
 * ("What has D'Souza and colleagues published on seizure cycles?") is a
 * question about that author's papers: retrieval is scoped to them, and no
 * sentence may say "X and colleagues" over a citation to a paper X did not
 * write. Both are deterministic: the catalogue's author index is the only
 * source of truth, and an attribution is rewritten to the cited paper's own
 * first author or removed - never to a guess.
 */
import type { Citation, ResourceSummary } from '@research-portal/core'

/** Words that are capitalised in a question for reasons other than being a surname. */
const NOT_A_SURNAME = new Set([
  'what',
  'which',
  'when',
  'where',
  'who',
  'how',
  'does',
  'did',
  'has',
  'have',
  'is',
  'are',
  'was',
  'were',
  'can',
  'could',
  'should',
  'would',
  'the',
  'and',
  'for',
  'from',
  'with',
  'that',
  'this',
  'these',
  'those',
  'compare',
  'summarise',
  'summarize',
  'list',
  'find',
  'give',
  'tell',
  'explain',
  'describe',
  'melbourne',
  'australia',
  'australian',
  'victoria',
  'sydney',
  'epilepsy',
  'seizure',
  'seizures',
  'group',
  'study',
  'trial',
  'cohort',
  'january',
  'february',
  'march',
  'april',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
])

function fold(value: string): string {
  return value.replace(/[’‘`]/g, "'").toLowerCase()
}

/** Surname from an "Surname AB" / "Surname, A. B." / "A. B. Surname" author string. */
export function surnameOf(author: string): string {
  const cleaned = author.replace(/[’‘`]/g, "'").replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const parts = cleaned.split(' ')
  // Initials are the all-caps short tokens; whatever remains is the surname.
  const names = parts.filter((part) => !/^[A-Z]{1,3}$/.test(part))
  if (names.length > 0 && names.length < parts.length) return names.join(' ')
  return parts[parts.length - 1] ?? ''
}

/** Whether a resource's author list carries the surname. */
export function hasAuthor(resource: { authors?: string[] }, surname: string): boolean {
  const wanted = fold(surname)
  return (resource.authors ?? []).some((a) => fold(surnameOf(a)) === wanted)
}

export interface NamedAuthor {
  surname: string
  /** Ids of the catalogue resources carrying the author. */
  resourceIds: string[]
}

/**
 * The surnames in a question that the catalogue's author index recognises,
 * with the resources each names. A candidate is a capitalised word of four
 * letters or more (apostrophes and hyphens allowed) that is not a lexicon
 * term, a known non-name, or an all-caps acronym; it must be an author of
 * at least one catalogue resource.
 */
export function authorsNamed(
  query: string,
  catalogue: readonly ResourceSummary[],
  lexicon: readonly string[] = [],
): NamedAuthor[] {
  const lexiconLower = new Set(lexicon.map((t) => t.toLowerCase()))
  const out: NamedAuthor[] = []
  const seen = new Set<string>()
  for (
    const m of query.matchAll(
      /(?<![\w'’])([A-Z][a-z]*['’]?[A-Z]?[a-z]+(?:-[A-Z][a-z]+)?)(?![\w'’])/g,
    )
  ) {
    const word = m[1]!
    const lower = fold(word)
    if (word.length < 4 || seen.has(lower)) continue
    if (NOT_A_SURNAME.has(lower) || lexiconLower.has(lower)) continue
    const resourceIds = catalogue.filter((r) => hasAuthor(r, word)).map((r) => r.id)
    if (resourceIds.length === 0) continue
    seen.add(lower)
    out.push({ surname: word, resourceIds })
  }
  return out
}

/**
 * The retrieval text for an author-scoped question: the question with the
 * attribution scaffolding removed ("What has D'Souza and colleagues
 * published on seizure cycles?" becomes "seizure cycles"). Retrieval is
 * already scoped to the author's articles, and the surname in the text
 * otherwise matches the reference lists of their other papers rather than
 * the papers' own findings (D1-05). Empty when nothing but scaffolding
 * remains.
 */
export function authorTopicQuery(query: string, surnames: readonly string[]): string {
  let text = query
  for (const surname of surnames) {
    text = text.replace(attributionPattern(surname), ' ')
    text = text.replace(
      new RegExp(
        `\\b(?:the\\s+)?${
          surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]")
        }(?:['’]s)?\\b`,
        'gi',
      ),
      ' ',
    )
  }
  text = text
    .replace(
      /\b(?:what|which|where|when)\s+(?:has|have|had|did|does|do|is|are|was|were)\b|\b(?:has|have)\s+(?:been\s+)?(?:published|written|authored|reported|found|shown|studied|investigated)\b|\b(?:published|publish|publications?|papers?|work|works|studies|research|contributions?)\s+(?:on|about|into|regarding|concerning)\b|\b(?:their|his|her|the)\s+(?:work|research|papers?|publications?|studies)\b/gi,
      ' ',
    )
    .replace(/^\s*(?:on|about|into|regarding|concerning)\b/i, ' ')
    .replace(/[?.!]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.split(/\s+/).filter((w) => w.length > 0).length >= 2 ? text : ''
}

/** "X and colleagues", "X et al.", "X and co-workers", "X's group", "the X group". */
function attributionPattern(surname: string): RegExp {
  const name = surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]")
  return new RegExp(
    `\\b(?:the\\s+)?${name}(?:['’]s\\s+(?:group|team|colleagues)|\\s+(?:and|&)\\s+(?:colleagues|co-?workers|collaborators|others)|\\s+et\\s+al\\.?|\\s+group)`,
    'gi',
  )
}

export interface AttributionFix {
  surname: string
  sentence: string
  /** The replacement made: the cited paper's first author, or a neutral subject. */
  replacedWith: string
}

/**
 * Rewrites every sentence that attributes work to a named author while
 * citing only papers that author did not write. One cited paper: its own
 * first author takes the attribution ("Xiong and colleagues"). Several with
 * different first authors, or an unknown author list: a neutral subject
 * ("Other authors"). A sentence with no markers is left alone - it may be
 * summarising the author's own papers cited elsewhere.
 */
export function correctAttributions(
  text: string,
  authors: readonly NamedAuthor[],
  citations: readonly Citation[],
  authorsOf: (resourceId: string) => string[] | undefined,
): { text: string; fixes: AttributionFix[] } {
  if (authors.length === 0) return { text, fixes: [] }
  const byIndex = new Map(citations.map((c) => [c.index, c.resourceId]))
  const fixes: AttributionFix[] = []
  const lines = text.split('\n').map((line) => {
    if (!/\[\d{1,3}\]/.test(line)) return line
    const sentences = line.split(/(?<=[.!?]["'”’)]*(?:\s*\[\d{1,3}\])*)\s+(?=[A-Z*(])/)
    return sentences.map((sentence) => {
      const markers = [...sentence.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1]))
      if (markers.length === 0) return sentence
      let out = sentence
      for (const author of authors) {
        const pattern = attributionPattern(author.surname)
        if (!pattern.test(out)) continue
        const cited = [
          ...new Set(markers.map((n) => byIndex.get(n)).filter((id): id is string => !!id)),
        ]
        if (cited.length === 0) continue
        const lists = cited.map((id) => authorsOf(id))
        if (
          lists.some((list) => list !== undefined && hasAuthor({ authors: list }, author.surname))
        ) continue
        const firsts = [...new Set(lists.map((list) => list?.[0] ? surnameOf(list[0]) : undefined))]
        const single = firsts.length === 1 ? firsts[0] : undefined
        const replacement = single ? `${single} and colleagues` : 'Other authors'
        pattern.lastIndex = 0
        out = out.replace(pattern, (m) => {
          const lead = /^the\s+/i.test(m) ? '' : ''
          return `${lead}${replacement}`
        })
        // "The X group" became "Other authors": fix a possessive that followed.
        fixes.push({
          surname: author.surname,
          sentence: sentence.trim(),
          replacedWith: replacement,
        })
      }
      return out
    }).join(' ')
  })
  return { text: lines.join('\n'), fixes }
}
