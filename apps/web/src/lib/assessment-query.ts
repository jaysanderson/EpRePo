/**
 * The instruction text the Assessment page sends to /generate as its query.
 *
 * Count and depth are not server-side parameters (the endpoint takes one
 * free-text query), so they are folded into the query; the server's quiz
 * schema still enforces the shape either way. Intermediate and advanced
 * checks ask for the figures and comparisons the sources report rather than
 * definitions with throwaway distractors (persona finding P8-11).
 */

export type QuestionCount = 3 | 5 | 10
export type Depth = 'foundational' | 'intermediate' | 'advanced'

export const COUNT_OPTIONS: QuestionCount[] = [3, 5, 10]

export const DEPTH_OPTIONS: { id: Depth; label: string; instruction: string }[] = [
  {
    id: 'foundational',
    label: 'Foundational',
    instruction:
      'Focus on core definitions, terminology and the basic what and why - suitable for someone new to the topic.',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    instruction:
      'Focus on how the concepts are applied in practice and how they relate to each other - suitable for someone with working knowledge. ' +
      'Prefer numeric or comparative stems: a reported figure, proportion or effect size, or a comparison between two interventions, groups or study designs.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    instruction:
      'Focus on nuanced distinctions, edge cases and trade-offs - suitable for a specialist. ' +
      'Every stem must turn on a specific figure, confidence interval, subgroup or head-to-head comparison the sources report, with distractors that are plausible neighbouring values or claims.',
  },
]

const DEPTH_BY_ID = new Map(DEPTH_OPTIONS.map((d) => [d.id, d]))

/** Whether a typed topic is substantial enough to build a quiz on. */
export function isUsableTopic(topic: string): boolean {
  const trimmed = topic.trim()
  return trimmed.length >= 3 && trimmed.length <= 120
}

export function buildAssessmentQuery(
  topicLabel: string,
  count: QuestionCount,
  depth: Depth,
): string {
  const meta = DEPTH_BY_ID.get(depth) ?? DEPTH_OPTIONS[0]!
  const topic = topicLabel.trim()
  return `Quiz me on ${topic}. Generate exactly ${count} multiple-choice questions at ${meta.label.toLowerCase()} depth. ${meta.instruction} Cover a spread of sub-topics within ${topic} rather than repeating the same idea.`
}
