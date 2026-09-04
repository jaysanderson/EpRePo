/**
 * The study-name guard. A question that names a study - "the BREATHS trial",
 * "UMPIRE", "the PERMIT pooled analysis", or a quoted title - must ground on
 * that study's paper, whatever retrieval ranks first. The guard finds the
 * catalogue resources a name in the question identifies, so the ask can pin
 * them into the grounding set and lead the sources with them.
 *
 * A study name is an upper-case token of four or more characters that names
 * at most a few articles: an acronym that titles a dozen papers (ILAE,
 * SUDEP, COVID-19) is a topic, not a study, and a gene symbol is a gene.
 * Pure functions over the catalogue, tested without the platform.
 */
import type { ResourceSummary } from '@research-portal/core'
import { GENERIC_ACRONYMS, looksLikeGeneSymbol } from './intent-router.ts'

export interface StudyMatch {
  id: string
  title: string
  /** The acronym or quoted fragment in the question that named it. */
  term: string
  kind: 'acronym' | 'title'
}

/** A name that titles more articles than this is a topic, not a study. */
export const MAX_ARTICLES_PER_NAME = 3
/** Resources pinned into one ask, at most. */
export const MAX_PINNED = 3

/** Upper-case tokens in the question that could name a study. */
export function studyAcronyms(query: string): string[] {
  const out: string[] = []
  for (const token of query.match(/\b[A-Z][A-Z0-9-]{3,}\b/g) ?? []) {
    const bare = token.replace(/-+$/, '')
    if (bare.length < 4 || out.includes(bare)) continue
    if (GENERIC_ACRONYMS.has(bare) || looksLikeGeneSymbol(bare)) continue
    if (/^(?:PMC|PMID)\d+$/i.test(bare) || /^\d+$/.test(bare)) continue
    out.push(bare)
  }
  return out
}

/** Quoted fragments long enough to be a title, straight or curly quotes. */
export function quotedTitles(query: string): string[] {
  const out: string[] = []
  for (const m of query.matchAll(/["“]([^"”]{12,})["”]/g)) {
    const fragment = m[1]?.trim()
    if (fragment && !out.includes(fragment)) out.push(fragment)
  }
  return out
}

/** Supplements, peer-review files and media attached to an article. */
export function isAttachmentTitle(title: string): boolean {
  return /^(?:supplementary|supplement\b|peer review|video|movie|media|additional file|appendix)/i
    .test(title)
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[‘’`]/g, "'").replace(/\s+/g, ' ').trim()
}

/** Newest first, then by title, so a pinned set is stable across calls. */
function newestFirst(a: ResourceSummary, b: ResourceSummary): number {
  return (b.year ?? b.published ?? '').localeCompare(a.year ?? a.published ?? '') ||
    a.title.localeCompare(b.title)
}

/**
 * The catalogue resources the question names. An acronym pins the articles
 * whose title carries it as a whole upper-case word, when there are few
 * enough to be one study; a quoted fragment pins the resources whose title
 * contains it. Articles come before their attachments and the list is
 * capped, so a pinned set never crowds the grounding window.
 */
export function matchStudies(
  query: string,
  catalogue: readonly ResourceSummary[],
): StudyMatch[] {
  const out: StudyMatch[] = []
  const seen = new Set<string>()
  const add = (resource: ResourceSummary, term: string, kind: StudyMatch['kind']) => {
    if (seen.has(resource.id) || out.length >= MAX_PINNED) return
    seen.add(resource.id)
    out.push({ id: resource.id, title: resource.title, term, kind })
  }
  for (const acronym of studyAcronyms(query)) {
    const word = new RegExp(`(?:^|[^A-Z0-9])${escape(acronym)}(?=$|[^A-Z0-9])`)
    const articles = catalogue
      .filter((r) => !isAttachmentTitle(r.title) && word.test(r.title))
      .sort(newestFirst)
    if (articles.length === 0 || articles.length > MAX_ARTICLES_PER_NAME) continue
    for (const article of articles) add(article, acronym, 'acronym')
  }
  for (const fragment of quotedTitles(query)) {
    const wanted = normalise(fragment)
    const matches = catalogue
      .filter((r) => normalise(r.title).includes(wanted))
      .sort((a, b) =>
        Number(isAttachmentTitle(a.title)) - Number(isAttachmentTitle(b.title)) ||
        newestFirst(a, b)
      )
    if (matches.length === 0 || matches.length > MAX_ARTICLES_PER_NAME) continue
    for (const match of matches) add(match, fragment, 'title')
  }
  return out
}
