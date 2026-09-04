import type { ResourceSummary, ScoredResource, SearchLookup } from '@research-portal/core'
import type { IdentifierKind } from './intent-router.ts'

// ---------------------------------------------------------------------------
// Exact lookups against catalogue metadata, run BEFORE any retrieval. A DOI,
// PMCID or PMID names one document: the answer is that resource or an honest
// "no resource carries this identifier", never five unrelated papers whose
// reference lists share a DOI prefix. An author surname is the same shape of
// question - the catalogue's `authors` field is the index the platform does
// not have.
// ---------------------------------------------------------------------------

function normaliseDoi(value: string): string {
  return value.trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '').replace(
    /^doi:\s*/,
    '',
  ).replace(/[.,;)]+$/, '')
}

function foldApostrophes(value: string): string {
  return value.replace(/[’‘`]/g, "'")
}

function pmcidOf(resource: ResourceSummary): string | undefined {
  if (resource.pmcid) return resource.pmcid.toUpperCase()
  const fromUrl = /\/(PMC\d{4,9})\/?$/i.exec(resource.originUrl ?? '')?.[1]
  return fromUrl?.toUpperCase()
}

/** Supplements and media files share their article's identifiers; the article comes first. */
function isAttachment(resource: ResourceSummary): boolean {
  return /^(?:supplementary|supplement\b|video|movie|media|additional file|appendix)/i.test(
    resource.title,
  ) || resource.type === 'video'
}

/** Articles before their attachments, newest first, then by title - a total order. */
export function articleFirst(resources: readonly ResourceSummary[]): ResourceSummary[] {
  return [...resources].sort((a, b) =>
    Number(isAttachment(a)) - Number(isAttachment(b)) ||
    (b.year ?? b.published ?? '').localeCompare(a.year ?? a.published ?? '') ||
    a.title.localeCompare(b.title)
  )
}

/**
 * The resources an identifier names, the article first and its supplements
 * after it (they share the article's PMC id and DOI); empty when the
 * catalogue holds nothing with it.
 */
export function resolveIdentifier(
  resources: readonly ResourceSummary[],
  identifier: { kind: IdentifierKind; value: string },
): ResourceSummary[] {
  const wanted = identifier.kind === 'doi'
    ? normaliseDoi(identifier.value)
    : identifier.value.toUpperCase()
  const matches = resources.filter((resource) => {
    const have = identifier.kind === 'doi'
      ? resource.doi ? normaliseDoi(resource.doi) : undefined
      : identifier.kind === 'pmcid'
      ? pmcidOf(resource)
      : resource.pmid?.trim()
    return have !== undefined && have === wanted
  })
  return articleFirst(matches)
}

/** Surname from an "Surname AB" / "Surname, A. B." / "A. B. Surname" author string. */
function surnameOf(author: string): string {
  const cleaned = foldApostrophes(author).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const parts = cleaned.split(' ')
  // "Vajda FJE" - the initials are the all-caps short tail.
  const first = parts[0] ?? ''
  const last = parts[parts.length - 1] ?? ''
  if (parts.length > 1 && /^[A-Z]{1,3}$/.test(last)) return parts.slice(0, -1).join(' ')
  if (parts.length > 1 && /^[A-Z]{1,3}$/.test(first)) return parts.slice(1).join(' ')
  return last
}

/**
 * Resources whose author list carries this surname, when the query is a bare
 * surname (one word, letters only, four or more characters, not a lexicon
 * term or a gene). Returns null when the query is not an author-shaped
 * lookup, an empty list when it is but nobody in the catalogue matches.
 */
export function resolveAuthor(
  resources: readonly ResourceSummary[],
  query: string,
): { surname: string; year?: string; matches: ResourceSummary[] } | null {
  const q = query.trim()
  // A bare surname, or a citation-shaped "Surname YYYY ..." (the rest of the
  // query is the topic and does not narrow the author match).
  const m = /^([A-Za-z][A-Za-z'’-]{3,})(?:\s+((?:19|20)\d\d)\b.*)?$/.exec(q)
  if (!m?.[1]) return null
  const surname = m[1]
  const year = m[2]
  const wanted = foldApostrophes(surname).toLowerCase()
  const matches = resources.filter((r) =>
    (r.authors ?? []).some((a) => surnameOf(a).toLowerCase() === wanted) &&
    (!year || r.year === year || (r.published ?? '').startsWith(year))
  )
  if (matches.length === 0) return null
  return { surname, ...(year ? { year } : {}), matches: articleFirst(matches) }
}

/** Shape a metadata match as a search result, with the record as its passage. */
export function metadataHit(resource: ResourceSummary, passage: string): ScoredResource {
  return {
    ...resource,
    relevance: 1,
    citedCount: 0,
    matchedPassage: passage,
    matchedField: 'metadata',
  }
}

/** Author line for a resource, for the metadata passage. */
export function authorLine(resource: ResourceSummary): string {
  const authors = resource.authors ?? []
  const shown = authors.slice(0, 6).join(', ') + (authors.length > 6 ? ' et al.' : '')
  const tail = [resource.journal, resource.year].filter(Boolean).join(', ')
  return tail ? `${shown} - ${tail}` : shown
}

export function lookupOf(
  kind: SearchLookup['kind'],
  value: string,
  matched: boolean,
): SearchLookup {
  return { kind, value, matched }
}
