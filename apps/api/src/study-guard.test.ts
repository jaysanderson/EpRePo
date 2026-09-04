import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import type { ResourceSummary } from '@research-portal/core'
import { isAttachmentTitle, matchStudies, quotedTitles, studyAcronyms } from './study-guard.ts'

const resource = (id: string, title: string, year = '2024'): ResourceSummary => ({
  id,
  title,
  type: 'pdf',
  summary: '',
  keyFacts: [],
  topicIds: [],
  year,
})

const catalogue: ResourceSummary[] = [
  resource(
    'breaths',
    'Breathing control training as a treatment for functional seizures (BREATHS trial): a multicentre, assessor-blinded randomised controlled trial protocol',
    '2025',
  ),
  resource(
    'breaths-pr',
    'Peer review history (2): Breathing control training as a treatment for functional seizures (BREATHS trial)',
    '2025',
  ),
  resource(
    'breaths-supp',
    'Supplementary material 1: Breathing control training as a treatment for functional seizures (BREATHS trial)',
    '2025',
  ),
  resource(
    'umpire',
    'The UMPIRE study: A first-in-human multicenter trial of bilateral subscalp monitoring for epileptic seizure detection',
  ),
  resource('permit', 'PERMIT study: a global pooled analysis study of perampanel', '2022'),
  resource(
    'exp',
    'Effectiveness of brivaracetam: EXPERIENCE, an international pooled analysis',
    '2023',
  ),
  resource('exp-user', 'User experience of a seizure risk forecasting app'),
  resource('resilience-neural', 'Loss of neuronal network resilience precedes seizures', '2018'),
  resource(
    'resilience',
    'RESILIENCE (Retrospective Linkage Study of Autoimmune Encephalitis): protocol',
  ),
  ...['a', 'b', 'c', 'd'].map((n) => resource(`ilae-${n}`, `ILAE classification paper ${n}`)),
  ...['a', 'b', 'c', 'd', 'e'].map((n) => resource(`sudep-${n}`, `SUDEP risk paper ${n}`)),
  resource('scn1a', 'SCN1A variants in Dravet syndrome'),
]

describe('studyAcronyms', () => {
  it('keeps upper-case tokens that could name a study and drops generic acronyms, genes and ids', () => {
    // ILAE is a generic acronym, SCN1A a gene, PMC123 an identifier, EEG too short.
    expect(studyAcronyms('In the UMPIRE sub-scalp trial, how many EEG channels? SCN1A PMC123 ILAE'))
      .toEqual(['UMPIRE'])
    expect(studyAcronyms('What did the BREATHS trial protocol say about SUDEP?')).toEqual([
      'BREATHS',
    ])
    expect(studyAcronyms('a lower-case question about seizures')).toEqual([])
  })
})

describe('quotedTitles', () => {
  it('takes straight and curly quoted fragments long enough to be a title', () => {
    expect(
      quotedTitles('Summarise "Multiday cycles of heart rate" and “Six common misconceptions”'),
    )
      .toEqual(['Multiday cycles of heart rate', 'Six common misconceptions'])
    expect(quotedTitles('the "n" of the "small" study')).toEqual([])
  })
})

describe('isAttachmentTitle', () => {
  it('recognises supplements, peer review files and media', () => {
    expect(isAttachmentTitle('Supplementary material 1: tables')).toBe(true)
    expect(isAttachmentTitle('Peer review history (2): the trial')).toBe(true)
    expect(isAttachmentTitle('The UMPIRE study')).toBe(false)
  })
})

describe('matchStudies', () => {
  it('pins the article a study acronym names, not its supplements', () => {
    const matches = matchStudies(
      'What is the primary outcome, sample size and control arm in the BREATHS trial protocol?',
      catalogue,
    )
    expect(matches.map((m) => m.id)).toEqual(['breaths'])
    expect(matches[0]).toMatchObject({ term: 'BREATHS', kind: 'acronym' })
  })

  it('matches the acronym as a whole upper-case word, so EXPERIENCE is the pooled analysis alone', () => {
    expect(matchStudies('12-month retention in EXPERIENCE and PERMIT', catalogue).map((m) => m.id))
      .toEqual(['exp', 'permit'])
    expect(matchStudies('the RESILIENCE protocol', catalogue).map((m) => m.id)).toEqual([
      'resilience',
    ])
  })

  it('treats a name that titles many papers as a topic and a gene as a gene', () => {
    expect(matchStudies('ILAE classification of SUDEP in SCN1A', catalogue)).toEqual([])
  })

  it('pins the resources a quoted title fragment names, article before attachment, capped', () => {
    const matches = matchStudies(
      'What does "Breathing control training as a treatment for functional seizures" conclude?',
      catalogue,
    )
    expect(matches.map((m) => m.id)).toEqual(['breaths', 'breaths-pr', 'breaths-supp'])
    expect(matches[0]?.kind).toBe('title')
  })

  it('never pins the same resource twice and caps the set', () => {
    const matches = matchStudies(
      'BREATHS "Breathing control training" UMPIRE PERMIT EXPERIENCE',
      catalogue,
    )
    expect(matches.length).toBe(3)
    expect(new Set(matches.map((m) => m.id)).size).toBe(3)
  })
})
