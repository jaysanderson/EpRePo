import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  auditAddendum,
  drugsFlaggedInSources,
  drugsMissingFromAnswer,
  extractNumbers,
  numbersMissing,
} from './answer-audit.ts'

describe('answer audit', () => {
  it('extracts figures but not markers, list numbers or years', () => {
    const answer =
      '1. At 1,400 mg per day or less the rate was 6.42% [1][2]; above it 33.9% (2024). HR 0.54.'
    expect(extractNumbers(answer)).toEqual(['1400mg', '6.42%', '33.9%', '0.54'])
  })

  it('flags figures absent from the cited texts', () => {
    const cited = [
      'Lamotrigine carried a 2.3% rate; the hazard ratio was 0.54 (95% CI 0.31 to 0.92).',
    ]
    expect(numbersMissing('The rate was 2.3% and 6.42%, HR 0.54', cited)).toEqual(['6.42%'])
  })

  it('finds contraindicated drugs in sources and the ones the answer dropped', () => {
    const texts = [{
      index: 7,
      text:
        'Sodium channel blockers should be avoided. Lamotrigine is contraindicated in children with DS (Moderate). Carbamazepine worsens seizures.',
    }]
    const flagged = drugsFlaggedInSources(texts, ['lamotrigine', 'carbamazepine', 'fenfluramine'])
    expect(flagged.map((f) => f.drug).sort()).toEqual(['carbamazepine', 'lamotrigine'])
    const missing = drugsMissingFromAnswer('Avoid carbamazepine and oxcarbazepine.', flagged)
    expect(missing).toEqual([{ drug: 'lamotrigine', index: 7 }])
    expect(auditAddendum({ missingDrugs: missing, missingNumbers: [] })).toContain(
      'lamotrigine [7]',
    )
    expect(auditAddendum({ missingDrugs: [], missingNumbers: [] })).toBe('')
  })
})
