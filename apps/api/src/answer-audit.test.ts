import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  abbreviationPairs,
  auditAddendum,
  denominatorsMissing,
  drugsFlaggedInSources,
  drugsMissingFromAnswer,
  extractNumbers,
  normaliseFigures,
  numbersMissing,
  proportions,
  statesDenominator,
  stripUnsupportedContraindications,
  studyDesignOf,
  termForms,
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

  it('gives both ends of a range the unit', () => {
    expect(extractNumbers('a 21–45% chance and 1400-1600 mg')).toEqual([
      '21%',
      '45%',
      '1400mg',
      '1600mg',
    ])
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
      ['12months', false],
      ['68%', true],
      ['2years', true],
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

describe('answer audit - abbreviations, denominators and designs', () => {
  it('learns the abbreviation a paper defines and accepts it beside the figure', () => {
    const permit =
      'Patients were treated with perampanel (PER). Retention on PER treatment at 3, 6, and 12 months was 90.5%, 79.8%, and 64.2%, respectively.'
    expect(abbreviationPairs(permit)).toEqual([{ phrase: 'perampanel', abbr: 'PER' }])
    const forms = termForms('perampanel', [{ phrase: 'perampanel', abbr: 'PER' }])
    expect(forms.some((re) => re.test('retention on PER treatment'))).toBe(true)
    expect(forms.some((re) => re.test('per cent of patients'))).toBe(false)
    const checks = verifyFigures(
      [{ text: 'The retention rate on perampanel at 12 months was 64.2%.', texts: [permit] }],
      [permit],
      ['perampanel'],
    )
    expect(checks.map((c) => [c.figure, c.supported])).toEqual([
      ['12months', true],
      ['64.2%', true],
    ])
  })

  it('keeps a confidence interval in the window of the statistic it belongs to', () => {
    const text =
      'Multivariable Cox regression revealed no significant difference in SUDEP risk in those prescribed lamotrigine at EMU admission (adjusted hazard ratio [aHR] = 0.56; 95% CI: 0.31– 1.01, p = 0.054). There was also no difference for NaM-ASMs (aHR = 0.82; 95% CI: 0.40– 1.68).'
    const checks = verifyFigures(
      [{
        text: 'SUDEP risk did not differ with lamotrigine (aHR 0.56, 95% CI 0.31–1.01, P = 0.054).',
        texts: [text],
      }],
      [text],
      ['lamotrigine'],
    )
    expect(checks.filter((c) => !c.supported).map((c) => c.figure)).toEqual([])
  })

  it('accepts the long form when the claim uses the abbreviation', () => {
    const text =
      'Radiofrequency thermocoagulation (RFTC) was performed. Naming declined by 30.60 (SD 39.60) after radiofrequency thermocoagulation of the language-dominant side.'
    const checks = verifyFigures(
      [{ text: 'After RFTC, naming declined by 30.60 (SD 39.60).', texts: [text] }],
      [text],
    )
    expect(checks.every((c) => c.supported)).toBe(true)
  })

  it('treats a duration as a unit-bearing figure', () => {
    expect(extractNumbers('Retention at 12 months was 64.2% over 2 years.')).toEqual([
      '12months',
      '64.2%',
      '2years',
    ])
    const text = 'the 12-month retention was 64.2%'
    expect(
      verifyFigures([{ text: 'Retention at 12 months was 64.2%.', texts: [text] }], [text])
        .map((c) => c.supported),
    ).toEqual([true, true])
  })

  it('finds proportions stated without a denominator and the n the passage gives', () => {
    expect(proportions('HR 1.41 (95% CI 1.02 to 1.97) and 23.2% seizure freedom')).toEqual([
      '23.2%',
      '1.41',
    ])
    expect(proportions('up to a 20% greater reduction in discharges; risk fell by 14%')).toEqual([])
    expect(statesDenominator('Retention was 71.1% (n = 1644).')).toBe(true)
    expect(statesDenominator('Retention was 71.1% in 1644 patients.')).toBe(true)
    expect(statesDenominator('Retention was 71.1%.')).toBe(false)
    const passage = 'The 12-month retention rate was 71.1% in the full analysis set (n = 1644).'
    expect(
      denominatorsMissing([
        { text: 'The 12-month retention rate was 71.1%.', texts: [{ index: 1, text: passage }] },
        {
          text: 'Seizure freedom was 23.2%.',
          texts: [{ index: 2, text: 'seizure freedom was 23.2% overall' }],
        },
      ]),
    ).toEqual([
      { figure: '71.1%', stated: 'n = 1644', index: 1 },
      { figure: '23.2%' },
    ])
    expect(
      denominatorsMissing([{
        text: 'Retention at 12 months was 64.2%.',
        texts: [{ index: 1, text: 'retention at 12 months was 64.2% (3031/4721)' }],
      }]),
    ).toEqual([{ figure: '64.2%', stated: '3031/4721', index: 1 }])
  })

  it('reads the study design from the paper itself', () => {
    expect(studyDesignOf('We conducted a nested case-control study of SUDEP.')).toBe(
      'a nested case-control study',
    )
    expect(studyDesignOf('A retrospective nested case–control study (en dash) of SUDEP.')).toBe(
      'a nested case-control study',
    )
    expect(
      studyDesignOf('Here we present a computational model of seizure cycles; simulations show'),
    ).toBe('a modelling study')
    expect(studyDesignOf('This prospective, multicenter first-in-human study implanted')).toBe(
      'a first-in-human study',
    )
    expect(studyDesignOf('Nothing about design here.')).toBeUndefined()
    expect(
      studyDesignOf(
        'The study protocol was approved by the ethics committee of this pooled analysis.',
      ),
    )
      .toBe('a pooled analysis')
    expect(studyDesignOf('This protocol for a randomised trial of befriending')).toBe(
      'a trial protocol',
    )
  })
})
