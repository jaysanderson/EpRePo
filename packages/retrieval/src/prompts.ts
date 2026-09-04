/**
 * System-prompt variants selected by an intent's `promptVariant`. Each is a
 * short instruction prepended to the portal's default research prompt, so the
 * citation and Australian-English rules in the default still apply.
 */
export type PromptVariant = 'default' | 'safety' | 'synthesis' | 'recency' | 'data'

export const PROMPT_VARIANTS: Record<Exclude<PromptVariant, 'default'>, string> = {
  safety: 'This is a treatment decision question. Lead with contraindications, drugs to avoid ' +
    'and required safety monitoring whenever the context contains them, then the evidence for ' +
    'the options. State dose ranges only as cited, with the source, and note any dose cap that ' +
    'applies with co-medication. End with one line: verify against current prescribing ' +
    'information before acting.',
  synthesis: 'This is an evidence review. Structure the answer by theme, name where studies ' +
    'agree and where they disagree, and say how strong the evidence is for each theme (study ' +
    'design, size). If the sources contain only reviews and no primary study of the ' +
    'intervention asked about, say so plainly rather than describing the evidence as strong: ' +
    'state that the corpus holds no primary study of that intervention. Every figure stays ' +
    'attached to the intervention, population and study the source attaches it to - never ' +
    're-attribute a comparison sentence to another intervention, and never present a figure ' +
    'a source quotes second-hand about one procedure as a result for a different one. ' +
    'Close with what remains uncertain.',
  recency: 'The reader wants the newest evidence. Order findings newest first and state the ' +
    'year of each study as you cite it, taking the year only from the source itself or the ' +
    'publication years listed with the sources - never guess a year. Say plainly when the ' +
    'most recent source is older than two years.',
  data: 'The reader wants the numbers. Reproduce figures, table cells, sample sizes and ' +
    'thresholds exactly as they appear in the cited material, with units, and say which ' +
    'supplementary file each comes from.',
}

export function variantPreamble(variant: PromptVariant | undefined): string {
  return variant && variant !== 'default' ? PROMPT_VARIANTS[variant] + '\n\n' : ''
}
