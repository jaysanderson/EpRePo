/**
 * The retrieval pin (docs/persona-reports/dsouza-loop7.md section 6).
 *
 * Three loops tried to make a bag of paragraphs drawn from several cohorts
 * safe by checking the answer afterwards, and each new rule moved the defect
 * somewhere the rule did not reach: an anti-LGI1 question answered with the
 * anti-NMDAR paper's 28%, a consortium's outcome taken from one member
 * study, a denominator borrowed from an unrelated paper. No post-hoc string
 * check can make that bag safe, because the right answer and a plausible
 * wrong one are both in it. Document chat, which sees one paper, answers the
 * same questions correctly in six seconds.
 *
 * So the names a question uses are resolved to resources BEFORE retrieval,
 * and retrieval is constrained to them, exactly as document chat is
 * constrained - on the platform's own `resource_filters`. What resolves:
 * antibodies and antigens ("anti-LGI1", "NMDAR antibody encephalitis"),
 * consortia, registries and networks, cohorts a question describes, trial
 * acronyms, quoted titles, and the drugs, syndromes and study names of the
 * tenant lexicon. A name that titles too many papers is a topic, not a name,
 * and pins nothing; when nothing resolves, retrieval is unchanged.
 *
 * Everything here is pure over the catalogue, so it is tested without the
 * platform. The platform half - the find inside the pin that decides whether
 * the pinned papers actually address the question - lives in the ask route.
 */
import type { ResourceSummary } from '@research-portal/core'
import { GENERIC_ACRONYMS } from './intent-router.ts'
import {
  bestTitleMatch,
  cohortDesignators,
  isAttachmentTitle,
  quotedTitles,
  studyAcronyms,
} from './study-guard.ts'

/** What kind of thing a name in the question is. */
export type NameKind = 'antibody' | 'group' | 'acronym' | 'title' | 'cohort' | 'term'

export interface QuestionName {
  /** The name as the question wrote it: "LGI1", "BREATHS", "Australian autoimmune encephalitis consortium". */
  text: string
  kind: NameKind
  /** The words a title or summary must carry for the name to match, lower-cased. */
  words: string[]
}

export interface ResolvedName {
  name: QuestionName
  /** Where the name was found: a paper's title, or its generated summary. */
  via: 'title' | 'summary'
  resourceIds: string[]
  titles: string[]
}

/** A name that matches more articles than this is a topic, not a name. */
export const MAX_ARTICLES_PER_NAME = 4
/** Resources one question may pin, at most: the platform's own grounding window. */
export const MAX_PIN_RESOURCES = 6
/** A summary-only match is a weaker signal, so fewer papers may carry it. */
export const MAX_SUMMARY_ARTICLES = 2

/**
 * The kinds that identify a cohort outright. A drug or a syndrome narrows a
 * question, it does not identify its papers - "levetiracetam" titles a rat
 * pharmacokinetics study and a real-world effectiveness pooled analysis
 * alike - so a lexicon term joins a pin that a stronger name has already
 * made, and never makes one on its own.
 */
const STRONG: ReadonlySet<NameKind> = new Set(['antibody', 'group', 'acronym', 'title', 'cohort'])

/** Whether a name identifies a cohort outright rather than merely narrowing one. */
export function isStrongName(name: QuestionName): boolean {
  return STRONG.has(name.kind)
}

/**
 * Tokens that never name an antigen: the drug classes "anti-" prefixes
 * ("antiseizure medication", "anti-epileptic drugs") and the imaging,
 * statistical and regulatory acronyms a sentence could put in front of
 * "encephalitis" by accident. The antigens themselves are deliberately NOT
 * filtered through the router's generic-acronym list: NMDAR, GABA and AMPA
 * sit in it because they are generic as topics, and "anti-NMDAR antibody
 * encephalitis" is exactly where they stop being one and name a cohort.
 */
const NOT_AN_ANTIGEN = new Set([
  'SEIZURE',
  'EPILEPTIC',
  'EPILEPSY',
  'INFLAMMATORY',
  'BODY',
  'BODIES',
  'CONVULSANT',
  'DEPRESSANT',
  'PSYCHOTIC',
  'BIOTIC',
  'BIOTICS',
  'COAGULANT',
  'HYPERTENSIVE',
  'OXIDANT',
  'EEG',
  'SEEG',
  'ECOG',
  'MRI',
  'FMRI',
  'MEG',
  'PET',
  'SPECT',
  'ILAE',
  'FDA',
  'TGA',
  'PBS',
  'ICU',
  'EMU',
  'RCT',
  'RCTS',
  'AUC',
  'ROC',
  'PMC',
  'PMID',
  'DOI',
])

/** An antigen token: an upper-case run, optionally with digits (LGI1, NMDAR, CASPR2, GAD65). */
const ANTIGEN = /^[A-Z][A-Z0-9]{2,9}$/

/**
 * The antibodies and antigens a question names. An antibody name is the one
 * class of name the study guard could never see: `looksLikeGeneSymbol`
 * rightly rejects "LGI1" as a gene, but in "anti-LGI1 antibody encephalitis"
 * it names an antibody, a cohort and one paper. Three shapes are read - the
 * "anti-" prefix, the word before "antibody" or "antibodies", and the word
 * before "encephalitis" - because the corpus uses all three.
 */
export function antibodyNames(query: string): string[] {
  const out: string[] = []
  const add = (token: string | undefined) => {
    // The token is tested as the question wrote it: "LGI1" and "NMDAR" are
    // antigens, "autoimmune encephalitis" names no antigen at all.
    if (!token || !ANTIGEN.test(token)) return
    if (NOT_AN_ANTIGEN.has(token)) return
    if (!out.includes(token)) out.push(token)
  }
  for (const m of query.matchAll(/\banti[-\s]?([A-Za-z][A-Za-z0-9]{2,9})\b/g)) add(m[1])
  for (
    const m of query.matchAll(
      /\b([A-Za-z][A-Za-z0-9]{2,9})[-\s]+(?:antibod(?:y|ies)|autoantibod(?:y|ies))\b/g,
    )
  ) add(m[1])
  for (
    const m of query.matchAll(
      /\b([A-Za-z][A-Za-z0-9]{2,9})[-\s]+(?:antibody[- ](?:mediated\s+)?)?encephalitis\b/g,
    )
  ) add(m[1])
  return out
}

/**
 * The consortia, registries, networks and biobanks a question names. A
 * cohort designator ("the LGI1 encephalitis cohort") is read by the study
 * guard; a named collaboration is not, because it rarely follows "the ...
 * cohort" and its own words - "Australian", "consortium" - are the ones
 * the designator reader drops as saying nothing about which paper it names.
 * Here they are exactly what discriminates.
 */
export function groupNames(query: string): string[] {
  const out: string[] = []
  for (
    const m of query.matchAll(
      /\b((?:[A-Za-z][\w-]*\s+){1,5}?(?:consortium|registry|register|network|collaborative|collaboration|biobank))\b/gi,
    )
  ) {
    const phrase = m[1]!.replace(/^(?:(?:the|a|an|in|of|from|for|by|within)\s+)+/i, '').trim()
    if (phrase.split(/\s+/).length < 2) continue
    if (!out.some((p) => p.toLowerCase() === phrase.toLowerCase())) out.push(phrase)
  }
  return out
}

/** Words of a designator that say nothing about which paper it names. */
const STRUCTURAL = new Set([
  'study',
  'studies',
  'trial',
  'trials',
  'cohort',
  'cohorts',
  'analysis',
  'analyses',
  'series',
  'group',
  'groups',
  'arm',
  'data',
  'dataset',
  'paper',
  'papers',
  'patients',
  'people',
  'participants',
  'adults',
  'children',
])

function words(phrase: string): string[] {
  return [
    ...new Set(
      (phrase.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []).filter((w) => !STRUCTURAL.has(w)),
    ),
  ]
}

/**
 * Every name the question uses, in the order a pin should prefer them:
 * antibodies and named collaborations first (they identify a cohort
 * outright), then trial acronyms and quoted titles, then a described
 * cohort, then the tenant's own lexicon terms.
 *
 * A cohort designator keeps every word it contains, geography included -
 * "the Australian autoimmune encephalitis cohort" is a different cohort
 * from "the German autoimmune encephalitis cohort", and the study guard's
 * reader drops exactly the word that tells them apart.
 */
export function questionNames(query: string, lexicon: readonly string[] = []): QuestionName[] {
  const out: QuestionName[] = []
  const add = (text: string, kind: NameKind) => {
    const w = words(text)
    if (w.length === 0) return
    if (out.some((n) => n.text.toLowerCase() === text.toLowerCase())) return
    out.push({ text, kind, words: w })
  }
  for (const antigen of antibodyNames(query)) add(antigen, 'antibody')
  for (const group of groupNames(query)) add(group, 'group')
  for (const acronym of studyAcronyms(query)) add(acronym, 'acronym')
  for (const fragment of quotedTitles(query)) add(fragment, 'title')
  for (const designator of cohortDesignators(query)) add(designator.phrase, 'cohort')
  const lower = query.toLowerCase()
  for (const term of lexicon) {
    const t = term.trim()
    if (t.length < 5 || GENERIC_ACRONYMS.has(t.toUpperCase())) continue
    if (new RegExp(`(?:^|[^a-z0-9])${escape(t.toLowerCase())}(?=$|[^a-z0-9])`).test(lower)) {
      add(t, 'term')
    }
  }
  return out
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whether a text carries every word of a name, hyphens read as spaces. */
function carries(text: string, name: QuestionName): boolean {
  const haystack = text.toLowerCase()
  return name.words.every((w) =>
    new RegExp(`(?:^|[^a-z0-9])${escape(w).replace(/-/g, '[-\\s]?')}(?=$|[^a-z0-9])`).test(haystack)
  )
}

/**
 * Whether a title carries an antigen or an acronym as the question wrote it,
 * in upper case. "EXPERIENCE" the pooled analysis titles two articles;
 * "experience" the English word titles seven more, and only the case tells
 * them apart (study-guard.ts reads acronyms the same way).
 */
function carriesAcronym(text: string, name: QuestionName): boolean {
  return new RegExp(`(?:^|[^A-Za-z0-9])${escape(name.text)}(?=$|[^A-Za-z0-9])`).test(text)
}

/**
 * Whether a text carries a multi-word name as one contiguous phrase. A
 * cohort or a collaboration is named as a phrase - "Australian autoimmune
 * encephalitis consortium" - and matching the phrase tells its four papers
 * apart from every paper that happens to use all three words somewhere in
 * its title.
 */
function carriesPhrase(text: string, name: QuestionName): boolean {
  if (name.words.length < 2) return false
  const pattern = name.words.map((w) => escape(w)).join('[^a-z0-9]+')
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`).test(text.toLowerCase())
}

/**
 * The resources each name identifies. A paper's title is the strong signal
 * and it wins outright: when any article's title carries the name, papers
 * that merely mention it in their generated summary are not the name's
 * papers - which is how the Australian consortium's own four papers are
 * told apart from an LGI1 sub-study whose summary mentions the consortium
 * (D7-02). A name too many titles carry is a topic and resolves to nothing.
 */
export function resolveNames(
  query: string,
  names: readonly QuestionName[],
  catalogue: readonly ResourceSummary[],
): ResolvedName[] {
  const articles = catalogue.filter((r) => !isAttachmentTitle(r.title))
  const out: ResolvedName[] = []
  const asTitle = (name: QuestionName, matched: readonly ResourceSummary[]) =>
    out.push({
      name,
      via: 'title' as const,
      resourceIds: matched.map((r) => r.id),
      titles: matched.map((r) => r.title),
    })
  for (const name of names) {
    // An antigen or a trial acronym is matched in the case the question
    // wrote it before anything else, so "EXPERIENCE" reaches the pooled
    // analysis rather than every paper that reports an experience.
    if (name.kind === 'antibody' || name.kind === 'acronym') {
      const byAcronym = articles.filter((r) => carriesAcronym(r.title, name))
      if (byAcronym.length > 0 && byAcronym.length <= MAX_ARTICLES_PER_NAME) {
        asTitle(name, byAcronym)
        continue
      }
    }
    // The whole phrase in a title is the strongest signal there is: it
    // resolves the Australian consortium's own four papers before the
    // looser word match can pull in every paper using the same words.
    const byPhrase = articles.filter((r) => carriesPhrase(r.title, name))
    if (byPhrase.length > 0 && byPhrase.length <= MAX_ARTICLES_PER_NAME) {
      asTitle(name, byPhrase)
      continue
    }
    const byTitle = articles.filter((r) => carries(r.title, name))
    if (byTitle.length > 0) {
      if (byTitle.length <= MAX_ARTICLES_PER_NAME) {
        asTitle(name, byTitle)
        continue
      }
      // A name that titles many papers is a topic - unless the rest of the
      // question singles one of them out, which is how "In the EXPERIENCE
      // study, what was the 12-month retention rate" reaches the pooled
      // analysis and not the nine other papers whose titles say
      // "experience" (study-guard.ts).
      const best = name.kind === 'acronym' || name.kind === 'title'
        ? bestTitleMatch(query, name.text, byTitle)
        : undefined
      if (best) asTitle(name, [best])
      continue
    }
    const bySummary = articles.filter((r) => carries(r.summary ?? '', name))
    if (bySummary.length === 0 || bySummary.length > MAX_SUMMARY_ARTICLES) continue
    out.push({
      name,
      via: 'summary',
      resourceIds: bySummary.map((r) => r.id),
      titles: bySummary.map((r) => r.title),
    })
  }
  return out
}

export interface NamePin {
  /** The resources retrieval is constrained to, best first. */
  resourceIds: string[]
  /** Their titles, for the prompt and the sources rail. */
  titles: string[]
  /** The names that resolved, for the route chip and the documentation. */
  names: string[]
  /** Every resolution, so the caller can say which name brought which paper. */
  resolved: ResolvedName[]
}

/**
 * The pin: the union of what the names resolved to, capped at the grounding
 * window. Nothing resolving means no pin, and retrieval is unchanged.
 */
export function namePin(resolved: readonly ResolvedName[]): NamePin | null {
  // A drug or a syndrome on its own is a topic: it narrows the question but
  // does not say which papers answer it, and pinning to whichever four
  // titles happen to carry the word would be worse than not pinning at all.
  if (!resolved.some((r) => isStrongName(r.name))) return null
  const order = [
    ...resolved.filter((r) => isStrongName(r.name)),
    ...resolved.filter((r) => !isStrongName(r.name)),
  ]
  const resourceIds: string[] = []
  const titles: string[] = []
  const kept: ResolvedName[] = []
  for (const resolution of order) {
    if (resourceIds.length >= MAX_PIN_RESOURCES) break
    let used = false
    for (let i = 0; i < resolution.resourceIds.length; i++) {
      const id = resolution.resourceIds[i]!
      if (resourceIds.includes(id) || resourceIds.length >= MAX_PIN_RESOURCES) continue
      resourceIds.push(id)
      titles.push(resolution.titles[i] ?? '')
      used = true
    }
    if (used || resolution.resourceIds.some((id) => resourceIds.includes(id))) kept.push(resolution)
  }
  if (resourceIds.length === 0) return null
  return { resourceIds, titles, names: kept.map((r) => r.name.text), resolved: kept }
}

/**
 * The whole pin in one call: the names the question uses, resolved against
 * the catalogue.
 */
export function resolvePin(
  query: string,
  catalogue: readonly ResourceSummary[],
  lexicon: readonly string[] = [],
): NamePin | null {
  return namePin(resolveNames(query, questionNames(query, lexicon), catalogue))
}

/**
 * The prompt addendum for an ask whose retrieval is pinned: the supplied
 * passages are the named papers' own, so the answer reports what they state
 * and never attributes a figure to a study that did not report it. It names
 * the question's own names, never the papers' titles: a title in the prompt
 * comes back as a title in the prose ("In *Acute and Long-Term
 * Immune-Treatment Strategies in Anti-LGI1 ...*, 16 patients ...").
 */
export function pinAddendum(pin: NamePin): string {
  const subject = pin.names.slice(0, 3).join(', ')
  const count = pin.resourceIds.length
  return `Every supplied passage comes from the ${
    count === 1 ? 'paper' : `${count} papers`
  } this question names (${subject}). ` +
    'Answer only from those passages and report what they state, with the sample or subgroup ' +
    'size beside each proportion. When they give the sample size in the text but report the ' +
    'outcome only in a figure or table, say exactly that and name the figure or table. Never ' +
    'declare absent something the supplied passages contain, and never state a figure that no ' +
    "supplied passage carries. Do not write a paper's title into the prose: the citation " +
    'marker identifies which paper each sentence came from.'
}
