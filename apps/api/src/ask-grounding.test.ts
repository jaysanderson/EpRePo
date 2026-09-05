/**
 * The bind-and-audit pass over the D'Souza loop 4 cases (docs/
 * persona-reports/dsouza-loop4.md): the question-level cohort guard, the
 * removal of second-hand figures on a named-cohort question, the strict
 * replacement, the denominator correction and the scaffolding strip, run
 * end to end over stubbed extractions.
 */
import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import type { ScoredResource, TenantConfig } from '@research-portal/core'
import { bindAndAudit, type ExtractionSource } from './ask-grounding.ts'
import { withheldDecline } from './answer-shape.ts'

const config = { slug: `test-${crypto.randomUUID()}` } as unknown as TenantConfig

function management(texts: Record<string, string>): ExtractionSource {
  return {
    resourceExtraction: (_tenant, id) => Promise.resolve({ text: texts[id] ?? '' }),
  }
}

function resource(id: string, title: string, summary: string, relevance = 0.9): ScoredResource {
  return {
    id,
    title,
    summary,
    type: 'pdf',
    topicIds: [],
    keyFacts: [],
    relevance,
    citedCount: 1,
  } as unknown as ScoredResource
}

const DRAVET = 'Defining Dravet syndrome: an essential prerequisite for precision therapy.\n\n' +
  'Abstract\n\nResults: Two hundred and five patients were studied at a median age of 8.5 years; ' +
  '25 were deceased.\n\nIntroduction\n\nDravet syndrome is a developmental epileptic ' +
  'encephalopathy.\n\nResults\n\nTwenty-five of 205 patients (12%) died at a median of 6.5 ' +
  'years (range 11 months to 39 years).\n\nDiscussion\n\nMortality was high.'

const VEM = 'Association Between Psychiatric Comorbidities and Mortality in Epilepsy.\n\n' +
  'Abstract\n\nMethods: A retrospective medical record audit was conducted on 2,709 adults \n' +
  'admitted for video-EEG monitoring (VEM) and diagnosed with epilepsy at 3 Victorian comprehensive epilepsy programs ' +
  'from 1995 to 2015. A total of 1,805 patients were included.\n\nIntroduction\n\nPeople with ' +
  'epilepsy die earlier.\n\nResults\n\nOf 147 deceased PWE over the study period, 87 had a ' +
  'lifetime history of a psychiatric disorder. The SMR was 3.6 (95% CI 2.9-4.4) in those with ' +
  'a psychiatric disorder and 2.5 (95% CI 1.9-3.2) in those without.\n\nDiscussion\n\nThe ' +
  'cohort is large.'

const GENOMICS = 'Genome-wide Polygenic Burden of Rare Deleterious Variants in SUDEP.\n\n' +
  'Abstract\n\nWe observed a significantly increased genome-wide burden score in the SUDEP ' +
  'cohort.\n\nIntroduction\n\nSUDEP is the leading cause of epilepsy-related death, with a ' +
  'comparable group of people with chronic epilepsy in Melbourne reporting a SUDEP incidence ' +
  'of 5.9/1000 patient-years (Nashef et al., 1995).\n\nResults\n\nThe burden score was ' +
  'increased (P = 5.7 x 10-3).\n\nDiscussion\n\nOur findings extend earlier work.'

const PERMIT =
  'PERMIT study: a global pooled analysis of perampanel.\n\nAbstract\n\nThe Full Analysis Set ' +
  'included 5193 PWE.\n\nIntroduction\n\nPerampanel is an AMPA antagonist.\n\nResults\n\n' +
  'Retention on PER treatment at 3, 6, and 12 months was 90.5% (4273/4721), 79.8% (3603/4516), ' +
  'and 64.2% \n (2698/4201), respectively. Over the longer term (> 12 months), retention was ' +
  '29.5% (1229/4164) and the mean retention time on PER treatment was 18.7 months. At 12 ' +
  'months, 17.6% (739/4201) of PWEs had discontinued PER due to AEs.\n\nDiscussion\n\nPER ' +
  'was well tolerated.'

const EXPERIENCE =
  'Effectiveness and Tolerability of 12-Month Brivaracetam: EXPERIENCE.\n\nAbstract\n\n' +
  'BRV retention was 89.4%, 79.8%, and 71.1% at 3, 6, and 12 months (n = 1644).\n\n' +
  'Introduction\n\nBrivaracetam is a SV2A ligand.\n\nResults\n\nAt 12 months, seizure freedom ' +
  'was 14.9% (n = 1111) and the 50% responder rate was 36.9% (n = 822).\n\nDiscussion\n\n' +
  'Retention was high.'

describe('bindAndAudit over the loop 4 cases', () => {
  it("removes a figure about another cohort on a question that names the cohort by designator, keeping the cohort paper's own sentence (D4-01)", async () => {
    const result = await bindAndAudit({
      management: management({ dravet: DRAVET, vem: VEM }),
      config,
      query:
        'How many adults were in the video-EEG monitoring mortality cohort, and how many died during follow-up?',
      text:
        'The video-EEG monitoring mortality cohort consisted of 2,709 adults admitted between ' +
        '1995 and 2015.[2] During follow-up, 25 of 205 patients (12%) died at a median of 6.5 ' +
        'years.[1]',
      citations: [
        { index: 1, resourceId: 'dravet', title: 'Defining Dravet syndrome' },
        { index: 2, resourceId: 'vem', title: 'Association Between Psychiatric Comorbidities' },
      ],
      sources: [
        resource('dravet', 'Defining Dravet syndrome', 'A Dravet syndrome cohort of 205 patients.'),
        resource(
          'vem',
          'Association Between Psychiatric Comorbidities and Mortality',
          'Mortality in adults admitted for video-EEG monitoring in Melbourne.',
        ),
      ],
      lexicon: [],
      variant: undefined,
      floor: 0.3,
      pinnedResourceIds: ['vem'],
      cohortResourceIds: ['vem'],
    })
    expect(result.text).toContain('2,709 adults')
    expect(result.text).not.toContain('25 of 205')
    expect(result.text).toContain(
      'the cited paper is not the cohort or study the question asks about',
    )
    expect(result.audit.sentencesRemoved).toBe(1)
    expect(result.citations.map((c) => c.resourceId)).toEqual(['vem'])
  })

  it('removes, rather than annotates, a second-hand figure on a named-cohort question (D4-02)', async () => {
    const result = await bindAndAudit({
      management: management({ genomics: GENOMICS, vem: VEM }),
      config,
      query:
        'What was the SUDEP incidence per 1000 patient-years in the Melbourne video-EEG monitoring cohort?',
      text:
        'The SUDEP incidence in the Melbourne video-EEG monitoring cohort was reported as 5.9 ' +
        'per 1000 patient-years, based on previous incidence data.[1]',
      citations: [{ index: 1, resourceId: 'genomics', title: 'Genome-wide Polygenic Burden' }],
      sources: [
        resource(
          'genomics',
          'Genome-wide Polygenic Burden of Rare Deleterious Variants in SUDEP',
          'SUDEP genomics in a Melbourne video-EEG monitoring cohort.',
        ),
        resource(
          'vem',
          'Association Between Psychiatric Comorbidities and Mortality',
          'Mortality in adults admitted for video-EEG monitoring in Melbourne.',
        ),
      ],
      lexicon: [],
      variant: undefined,
      floor: 0.3,
      cohortResourceIds: ['genomics', 'vem'],
    })
    expect(result.emptied).toBe(true)
    expect(result.audit.figuresSecondhandRemoved).toContain('5.9')
    expect(result.audit.figuresRemoved).toContain('5.9')
    expect(result.text).not.toContain('Second-hand figures')
    // The decline the handler shows for an emptied answer says why.
    expect(
      withheldDecline(
        ['Genome-wide Polygenic Burden'],
        result.audit.figuresRemoved,
        [],
        result.audit.figuresSecondhandRemoved,
      ),
    ).toContain('carries 5.9, 1000 only where it cites other studies')
  })

  it('never substitutes a different time point for a removed figure, and never replaces a decline (D4-03, D4-04)', async () => {
    const result = await bindAndAudit({
      management: management({ permit: PERMIT, experience: EXPERIENCE }),
      config,
      query:
        'What 12-month retention rate should I assume for adjunctive perampanel versus brivaracetam, with the denominators for each?',
      text: 'For adjunctive perampanel, the 12-month retention rate is 61.2% (n = 4201).[1] For ' +
        'brivaracetam, the 12-month retention rate is 71.1% (n = 1644).[2] The cited sources do ' +
        'not report the number of patients aged 65 and over.',
      citations: [
        { index: 1, resourceId: 'permit', title: 'PERMIT study' },
        { index: 2, resourceId: 'experience', title: 'EXPERIENCE' },
      ],
      sources: [
        resource(
          'permit',
          'PERMIT study: a global pooled analysis',
          'Perampanel in real-world use.',
        ),
        resource('experience', 'EXPERIENCE pooled analysis', 'Brivaracetam in real-world use.'),
      ],
      lexicon: ['perampanel', 'brivaracetam'],
      variant: undefined,
      floor: 0.3,
      pinnedTerms: ['perampanel', 'brivaracetam'],
      pinnedResourceIds: ['permit', 'experience'],
    })
    expect(result.text).not.toContain('is 61.2%')
    expect(result.text).not.toContain('29.5%')
    expect(result.text).not.toContain('The paper itself reports')
    expect(result.text).toContain('71.1% (n = 1644).[1]')
    expect(result.text).toContain(
      'The cited sources do not report the number of patients aged 65 and over.',
    )
    expect(result.audit.sentencesReplaced).toBe(0)
    expect(result.audit.sentencesRemoved).toBe(1)
  })

  it("keeps a correct figure cited to the right drug's paper on a two-drug comparison (D4-03 root cause)", async () => {
    const result = await bindAndAudit({
      management: management({ permit: PERMIT, experience: EXPERIENCE }),
      config,
      query:
        'What 12-month retention rate should I assume for adjunctive perampanel versus brivaracetam in real-world cohorts?',
      text: 'For adjunctive perampanel, the 12-month retention rate is 64.2% (n = 4201).[1] For ' +
        'brivaracetam, the 12-month retention rate is 71.1% (n = 1644).[2]',
      citations: [
        { index: 1, resourceId: 'permit', title: 'PERMIT study' },
        { index: 2, resourceId: 'experience', title: 'EXPERIENCE' },
      ],
      sources: [
        resource(
          'permit',
          'PERMIT study: a global pooled analysis',
          'Perampanel in real-world use.',
        ),
        resource('experience', 'EXPERIENCE pooled analysis', 'Brivaracetam in real-world use.'),
      ],
      lexicon: ['perampanel', 'brivaracetam'],
      variant: undefined,
      floor: 0.3,
      // Only brivaracetam titled few enough papers to be pinned, as in loop 4.
      pinnedTerms: ['brivaracetam'],
      pinnedResourceIds: ['experience'],
    })
    expect(result.text).toContain('64.2% (n = 4201).[1]')
    expect(result.text).toContain('71.1% (n = 1644).[2]')
    expect(result.audit.sentencesRemoved).toBe(0)
  })

  it('never lets a drug pin stand in for the designated cohort (D3-01 replay)', async () => {
    const NMDAR =
      'Rituximab Use for Relapse Prevention in Anti-NMDAR Antibody-Mediated Encephalitis.\n\n' +
      'Abstract\n\nResults: A single course of rituximab was associated with longer time to first ' +
      'relapse (hazard ratio [HR] 0.11, 95% CI 0.02-0.70, p = 0.02).\n\nIntroduction\n\nAnti-NMDAR ' +
      'encephalitis is common.\n\nResults\n\nRituximab reduced relapse (HR 0.11, 95% CI 0.02-0.70, ' +
      'p = 0.02, n = 51).\n\nDiscussion\n\nRituximab works.'
    const LGI1 = 'Acute and Long-Term Immune-Treatment Strategies in Anti-LGI1 Antibody-Mediated ' +
      'Encephalitis.\n\nAbstract\n\nResults: Rituximab, adjusted for concomitant use of other ' +
      'immunotherapies, was associated with increased time to first relapse (hazard ratio 0.10; ' +
      '95% CI 0.001-0.85; p = 0.03).\n\nIntroduction\n\nLGI1 encephalitis relapses.\n\nResults\n\n' +
      'Rituximab was administered in 26 (49%) and cyclophosphamide in 3 (6%) patients.\n\n' +
      'Discussion\n\nRituximab prevents relapse.'
    const result = await bindAndAudit({
      management: management({ nmdar: NMDAR, lgi1: LGI1 }),
      config,
      query:
        'In the LGI1 encephalitis cohort, how many patients received rituximab, and what was the hazard ratio for time to first relapse with rituximab?',
      text:
        'The hazard ratio for time to first relapse with rituximab was 0.11 (95% CI 0.02-0.70, p = 0.02, n = 51).[1]',
      citations: [{ index: 1, resourceId: 'nmdar', title: 'Rituximab Use for Relapse Prevention' }],
      sources: [
        resource(
          'nmdar',
          'Rituximab Use for Relapse Prevention in Anti-NMDAR Encephalitis',
          'Rituximab in anti-NMDAR encephalitis; LGI1 is discussed.',
        ),
        resource(
          'lgi1',
          'Acute and Long-Term Immune-Treatment Strategies in Anti-LGI1 Encephalitis',
          'The LGI1 encephalitis cohort.',
        ),
      ],
      lexicon: ['rituximab'],
      variant: undefined,
      floor: 0.3,
      pinnedTerms: ['rituximab'],
      pinnedResourceIds: ['lgi1', 'nmdar'],
      cohortResourceIds: ['lgi1'],
    })
    expect(result.text).not.toContain('0.11')
    expect(result.audit.sentencesReplaced).toBe(0)
    expect(result.emptied).toBe(true)
  })

  it('keeps the markers of a pinned paper below the display floor, and list items inherit them (TD2 replay)', async () => {
    const BREATHS =
      'Breathing control training as a treatment for functional seizures: the BREATHS ' +
      'protocol.\n\nAbstract\n\nThe primary outcome is seizure remission at week 12.\n\nMethods\n\n' +
      'Assessments are at baseline, week 4, week 12 (the primary outcome time point) and week 24, ' +
      'with optional follow-up at weeks 52, 78 and 104. Hyperventilation is measured by the ' +
      'Nijmegen scale at baseline, week 4, week 12 and week 24.'
    const result = await bindAndAudit({
      management: management({ breaths: BREATHS }),
      config,
      query: 'What assessment time points does the BREATHS protocol specify?',
      text:
        'The BREATHS protocol specifies these time points:\n- Seizure remission measured at Week 12.[1]\n- Baseline\n- Week 4\n- Week 24',
      citations: [{ index: 1, resourceId: 'breaths', title: 'BREATHS protocol' }],
      sources: [
        resource(
          'breaths',
          'Breathing control training: the BREATHS protocol',
          'The BREATHS trial.',
          0.1,
        ),
      ],
      lexicon: [],
      variant: undefined,
      floor: 0.3,
      pinnedResourceIds: ['breaths'],
      pinnedTerms: ['BREATHS'],
    })
    expect(result.audit.sentencesCited).toBe(result.audit.sentencesChecked)
    expect(result.text).toContain('- Week 24[1]')
  })

  it("corrects a denominator to the passage's own pairing and says so (D4-05)", async () => {
    const result = await bindAndAudit({
      management: management({ permit: PERMIT }),
      config,
      query:
        'What adverse-event discontinuation should I assume for perampanel at 12 months, with denominators?',
      text:
        'The adverse-event discontinuation rate at 12 months was 17.6% (n = 5193, full analysis set).[1]',
      citations: [{ index: 1, resourceId: 'permit', title: 'PERMIT study' }],
      sources: [
        resource(
          'permit',
          'PERMIT study: a global pooled analysis',
          'Perampanel in real-world use.',
        ),
      ],
      lexicon: ['perampanel'],
      variant: undefined,
      floor: 0.3,
    })
    expect(result.text).toContain('17.6% (739/4201).[1]')
    expect(result.text).not.toContain('(n = 5193')
    expect(result.text).toContain(
      "One denominator was corrected to the cited passage's own pairing",
    )
    expect(result.audit.denominatorsCorrected).toEqual(['17.6% (739/4201)'])
  })

  it('pairs each proportion with the n in its own bracket in the denominator note (D4-05)', async () => {
    const result = await bindAndAudit({
      management: management({ experience: EXPERIENCE }),
      config,
      query:
        'What was the seizure freedom rate for brivaracetam at 12 months in EXPERIENCE, and the 50% responder rate?',
      text:
        'The seizure freedom rate for brivaracetam at 12 months was 14.9%.[1] The 50% responder rate was 36.9% at the same 12-month mark.[1]',
      citations: [{ index: 1, resourceId: 'experience', title: 'EXPERIENCE' }],
      sources: [
        resource('experience', 'EXPERIENCE pooled analysis', 'Brivaracetam in real-world use.'),
      ],
      lexicon: ['brivaracetam'],
      variant: undefined,
      floor: 0.3,
    })
    expect(result.text).toContain(
      'the cited passage gives n = 1111 for 14.9% [1], n = 822 for 36.9% [1]',
    )
    expect(result.text).not.toContain('for 50%')
  })

  it("strips the generator's scaffolding before judging the sentences (D4-14, D4-11)", async () => {
    const result = await bindAndAudit({
      management: management({ vem: VEM }),
      config,
      query: 'What was the standardised mortality ratio in those with a psychiatric comorbidity?',
      text:
        'The SMR was 3.6 (95% CI 2.9-4.4; no denominator stated) in those with a psychiatric disorder.[1] Cited sources from the provided context.',
      citations: [{ index: 1, resourceId: 'vem', title: 'Association' }],
      sources: [resource('vem', 'Association Between Psychiatric Comorbidities', 'Mortality.')],
      lexicon: [],
      variant: undefined,
      floor: 0.3,
    })
    expect(result.text).toContain(
      'The SMR was 3.6 (95% CI 2.9-4.4) in those with a psychiatric disorder.[1]',
    )
    expect(result.text).not.toContain('no denominator stated')
    expect(result.text).not.toContain('Cited sources from the provided context')
    expect(result.audit.denominatorsMissing).toEqual([])
  })
})
