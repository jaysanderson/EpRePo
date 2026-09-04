import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  auditAddendum,
  drugsFlaggedInSources,
  drugsMissingFromAnswer,
  extractNumbers,
  normaliseFigures,
  numbersMissing,
  stripUnsupportedContraindications,
  verifyFigures,
  yearsInAnswer,
  yearsUnsupported,
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

describe('answer audit - claim verification', () => {
  it('normalises ranges and leading-zero decimals on both sides', () => {
    expect(normaliseFigures('21–45% and 21 to 45% and .5 mg')).toBe('21-45% and 21-45% and 0.5 mg')
    expect(numbersMissing('Risk was 21% to 45%.', ['recurrence of 21–45% at two years'])).toEqual(
      [],
    )
    expect(numbersMissing('A dose of .5 mg/kg.', ['0.5 mg/kg was given'])).toEqual([])
  })

  it('needs the unit beside the number: "21%" is not "21 patients"', () => {
    expect(numbersMissing('Recurrence was 21%.', ['21 patients relapsed; recurrence was 45%']))
      .toEqual([
        '21%',
      ])
    expect(numbersMissing('Recurrence was 21% to 45%.', ['recurrence of 21–45% at two years']))
      .toEqual([])
    expect(numbersMissing('A dose of 1400 mg.', ['doses of 1,400 mg/day'])).toEqual([])
  })

  it('does not treat labels like "Table 2" or "Patient 10" as figures', () => {
    expect(extractNumbers('Table 2 lists Patient 10 and Patient 12; the rate was 12%.')).toEqual([
      '12%',
    ])
  })

  it('checks a figure beside its own terms, catching a number borrowed from another intervention', () => {
    const rftc =
      'A cross-electrode RFTC study of 21 patients with HS reported that 76% had seizure freedom at 12 months. ' +
      'Long-term efficacy has been reported as 64% past 63 months for resection and 68% at 2 years for LITT.'
    const checks = verifyFigures(
      [
        { text: 'LITT achieved 76% seizure freedom at 12 months.', texts: [rftc] },
        { text: 'LITT achieved 68% seizure freedom at 2 years.', texts: [rftc] },
      ],
      [rftc],
      [],
    )
    expect(checks.map((c) => [c.figure, c.supported])).toEqual([
      ['76%', false],
      ['12', false],
      ['68%', true],
    ])
  })

  it('post-checks years against resource metadata and the cited texts', () => {
    expect(yearsInAnswer('A study in 2025 found cycles [1]; the 2017 classification applies.'))
      .toEqual(['2025', '2017'])
    expect(
      yearsUnsupported('A study in 2025 found cycles. The 2017 classification applies.', ['2021'], [
        'Following the 2017 ILAE classification we recorded multiday cycles.',
      ]),
    ).toEqual(['2025'])
  })

  it('strips a contraindication the cited sources never state and says so', () => {
    const answer =
      'Yes, vigabatrin is contraindicated in Dravet syndrome as it is a sodium channel blocker [1]. ' +
      'Lamotrigine should be avoided in Dravet syndrome [2]. Verify before acting.'
    const texts = [
      'Participants must be on stable therapy; vigabatrin was a concomitant medication.',
      'Sodium channel blockers should be avoided. Lamotrigine is contraindicated in children with DS.',
    ]
    const result = stripUnsupportedContraindications(answer, texts, ['vigabatrin', 'lamotrigine'])
    expect(result.unsupported).toEqual(['vigabatrin'])
    expect(result.text).toBe(
      '*The cited sources do not state that vigabatrin is contraindicated or should be avoided here.* ' +
        'Lamotrigine should be avoided in Dravet syndrome [2]. Verify before acting.',
    )
  })

  it('matches a drug class across hyphenation', () => {
    const answer = 'Sodium channel-blocking medications are contraindicated in Dravet syndrome.'
    const result = stripUnsupportedContraindications(answer, [
      'Sodium channel blockers should be avoided in Dravet syndrome.',
    ], ['lamotrigine'])
    expect(result).toEqual({ text: answer, unsupported: [] })
  })

  it('leaves a supported contraindication alone', () => {
    const answer = 'Lamotrigine is contraindicated in Dravet syndrome [1].'
    const result = stripUnsupportedContraindications(answer, [
      'Lamotrigine is contraindicated in children with DS.',
    ], ['lamotrigine'])
    expect(result).toEqual({ text: answer, unsupported: [] })
  })
})
