import { expect } from '@std/expect'
import { buildAssessmentQuery, isUsableTopic } from './assessment-query.ts'

Deno.test('a typed topic feeds the same query template as a tile (P8-05)', () => {
  const fromTile = buildAssessmentQuery('Autoimmune encephalitis', 5, 'intermediate')
  const fromText = buildAssessmentQuery('  Autoimmune encephalitis ', 5, 'intermediate')
  expect(fromText).toBe(fromTile)
  expect(fromTile).toContain('Quiz me on Autoimmune encephalitis.')
  expect(fromTile).toContain('exactly 5 multiple-choice questions at intermediate depth')
})

Deno.test('intermediate and advanced depths ask for numeric or comparative stems (P8-11)', () => {
  expect(buildAssessmentQuery('Dravet syndrome', 3, 'foundational')).not.toContain('comparison')
  expect(buildAssessmentQuery('Dravet syndrome', 3, 'intermediate')).toContain(
    'numeric or comparative stems',
  )
  expect(buildAssessmentQuery('Dravet syndrome', 10, 'advanced')).toContain('confidence interval')
})

Deno.test('topic usability guards the free-text box', () => {
  expect(isUsableTopic('')).toBe(false)
  expect(isUsableTopic('ab')).toBe(false)
  expect(isUsableTopic('SCN1A')).toBe(true)
  expect(isUsableTopic('x'.repeat(121))).toBe(false)
})
