import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  bindSentences,
  looksLikeBibliographyEntry,
  prepareText,
  sentenceFeatures,
  splitSentences,
  stripReferenceSection,
  supportScore,
} from './citation-binding.ts'

const LEXICON = ['vigabatrin', 'lamotrigine', 'levetiracetam', 'phenytoin', 'Dravet']

const CONSENSUS =
  'International consensus on diagnosis and management of Dravet syndrome. Sodium channel ' +
  'blockers should be avoided. Lamotrigine is contraindicated in children with DS (Moderate). ' +
  'First-line treatment is valproate; fenfluramine and stiripentol are second-line options.'

const PROTOCOL =
  'ZYN002 cannabidiol gel in children with developmental and epileptic encephalopathies. ' +
  'Participants must be on stable therapy for at least 6 months; vigabatrin was recorded as a ' +
  'concomitant medication in 14 patients.'

const RECURRENCE =
  'After a first unprovoked seizure the recurrence risk within two years was 21-45% across ' +
  'cohorts. Employment fell by 14% in the year after the first seizure.'

describe('splitSentences', () => {
  it('keeps markers with their sentence and does not split on abbreviations or decimals', () => {
    const text =
      'Rates were 6.42% below 1400 mg [1]. Above it, e.g. at 1500 mg, 33.9% [2]. Verify before acting.[1][2]'
    expect(splitSentences(text)).toEqual([
      'Rates were 6.42% below 1400 mg [1].',
      'Above it, e.g. at 1500 mg, 33.9% [2].',
      'Verify before acting.[1][2]',
    ])
  })
})

describe('supportScore', () => {
  it('rejects a text that lacks every named drug in the sentence', () => {
    const features = sentenceFeatures(
      'Drugs like ethosuximide, valproate and lamotrigine suppress seizures.',
      ['ethosuximide', 'valproate', 'lamotrigine'],
    )
    expect(supportScore(features, prepareText('A multi-omic network analysis of GAERS rats.')))
      .toBe(0)
  })

  it('accepts a paraphrase whose words, entity and figure are in the text', () => {
    const features = sentenceFeatures(
      'Lamotrigine is contraindicated in Dravet syndrome.',
      LEXICON,
    )
    expect(supportScore(features, prepareText(CONSENSUS))).toBeGreaterThan(0)
  })

  it('needs most of a drug list present, not one drug of four', () => {
    const features = sentenceFeatures(
      'Sodium channel blockers include phenytoin, carbamazepine, oxcarbazepine and lamotrigine.',
      ['phenytoin', 'carbamazepine', 'oxcarbazepine', 'lamotrigine'],
    )
    expect(
      supportScore(
        features,
        prepareText('Lamotrigine, a sodium channel blocker, was withdrawn in two patients.'),
      ),
    ).toBe(0)
    expect(
      supportScore(
        features,
        prepareText(
          'Sodium channel blockers such as phenytoin, carbamazepine, oxcarbazepine and lamotrigine worsen seizures.',
        ),
      ),
    ).toBeGreaterThan(0)
  })

  it('rejects a figure the text does not carry even when the words match', () => {
    const features = sentenceFeatures(
      'The recurrence risk after a first unprovoked seizure is 21% to 45% [1].',
      [],
    )
    expect(supportScore(features, prepareText(PROTOCOL))).toBe(0)
    expect(supportScore(features, prepareText(RECURRENCE))).toBeGreaterThan(0)
    // One figure of two is not enough.
    expect(
      supportScore(
        features,
        prepareText('Recurrence after a first unprovoked seizure reached 45% in this cohort.'),
      ),
    ).toBe(0)
  })
})

describe('bindSentences', () => {
  it('binds each sentence to the passage that carries it and drops the paragraph spray', () => {
    const text = 'Lamotrigine is contraindicated in Dravet syndrome. ' +
      'Vigabatrin was recorded as a concomitant medication in 14 patients. ' +
      'Verify against current prescribing information before acting.[1][2][3]'
    const result = bindSentences({
      text,
      citations: [
        { index: 1, resourceId: 'protocol', title: 'ZYN002 protocol' },
        { index: 2, resourceId: 'consensus', title: 'Dravet consensus' },
        { index: 3, resourceId: 'recurrence', title: 'First seizure' },
      ],
      texts: new Map([[1, PROTOCOL], [2, CONSENSUS], [3, RECURRENCE]]),
      lexicon: LEXICON,
    })
    expect(result.text).toBe(
      'Lamotrigine is contraindicated in Dravet syndrome.[1] ' +
        'Vigabatrin was recorded as a concomitant medication in 14 patients.[2] ' +
        'Verify against current prescribing information before acting.',
    )
    expect(result.citations.map((c) => [c.index, c.resourceId])).toEqual([
      [1, 'consensus'],
      [2, 'protocol'],
    ])
    expect(result.sentences.map((s) => s.bound)).toEqual([[1], [2], []])
    expect(result.dropped).toBeGreaterThan(0)
  })

  it('drops a marker whose cited text does not contain the claim and rebinds to one that does', () => {
    const text =
      'Approximately 10% of children with an apparently de novo SCN1A variant had a parent with mosaicism [1].'
    const result = bindSentences({
      text,
      citations: [
        { index: 1, resourceId: 'gnao1', title: 'GNAO1 spectrum' },
        { index: 2, resourceId: 'mosaic', title: 'Parental mosaicism' },
      ],
      texts: new Map([
        [1, 'Phenotypic spectrum of GNAO1 variants in neurodevelopmental disorders.'],
        [
          2,
          'These findings show that approximately 10% of children with an apparently de novo SCN1A variant had a parent with low-level mosaicism.',
        ],
      ]),
      lexicon: [],
    })
    expect(result.text).toContain('mosaicism.[1]')
    expect(result.citations).toEqual([{
      index: 1,
      resourceId: 'mosaic',
      title: 'Parental mosaicism',
    }])
    expect(result.rebound).toBe(1)
  })

  it('keeps markers off headings and leaves list structure intact', () => {
    const result = bindSentences({
      text:
        '### Contraindications [1]\n- Lamotrigine is contraindicated in Dravet syndrome. [1]\n- Unsupported claim about nothing at all. [1]',
      citations: [{ index: 1, resourceId: 'consensus', title: 'Consensus' }],
      texts: new Map([[1, CONSENSUS]]),
      lexicon: LEXICON,
    })
    expect(result.text).toBe(
      '### Contraindications\n- Lamotrigine is contraindicated in Dravet syndrome.[1]\n- Unsupported claim about nothing at all.',
    )
  })

  it('renumbers by first appearance and orders every run of markers ascending', () => {
    const result = bindSentences({
      text: 'Lamotrigine is contraindicated in Dravet syndrome. [3] ' +
        'Sodium channel blockers should be avoided in Dravet syndrome. [3][1]',
      citations: [
        { index: 1, resourceId: 'consensus-copy', title: 'Consensus (copy)' },
        { index: 3, resourceId: 'consensus', title: 'Consensus' },
      ],
      texts: new Map([[1, CONSENSUS], [3, CONSENSUS]]),
      lexicon: LEXICON,
    })
    // Both texts carry both sentences, and the paragraph's trailing markers
    // are candidates for every sentence in it, so each sentence binds to both.
    expect(result.text).toBe(
      'Lamotrigine is contraindicated in Dravet syndrome.[1][2] ' +
        'Sodium channel blockers should be avoided in Dravet syndrome.[1][2]',
    )
    expect(result.citations.map((c) => c.resourceId)).toEqual(['consensus-copy', 'consensus'])
  })

  it('drops markers to citations under the display floor', () => {
    const result = bindSentences({
      text: 'Lamotrigine is contraindicated in Dravet syndrome. [1]',
      citations: [{ index: 1, resourceId: 'consensus', title: 'Consensus' }],
      texts: new Map([[1, CONSENSUS]]),
      lexicon: LEXICON,
      belowFloor: new Set([1]),
    })
    expect(result.text).toBe('Lamotrigine is contraindicated in Dravet syndrome.')
    expect(result.citations).toEqual([])
  })

  it('keeps a marker to a citation whose text could not be fetched', () => {
    const result = bindSentences({
      text: 'Lamotrigine is contraindicated in Dravet syndrome. [1]',
      citations: [{ index: 1, resourceId: 'consensus', title: 'Consensus' }],
      texts: new Map(),
      lexicon: LEXICON,
    })
    expect(result.text).toBe('Lamotrigine is contraindicated in Dravet syndrome.[1]')
  })
})

describe('reference-list exclusion', () => {
  it('recognises bibliography entries', () => {
    expect(
      looksLikeBibliographyEntry(
        '41. Temkin NR, Dikmen SS. More harm than good: antiseizure prophylaxis after traumatic brain injury. Neurology. 2001;56(4):32-38.',
      ),
    ).toBe(true)
    expect(
      looksLikeBibliographyEntry(
        'Karoly PJ, Stirling RE, Freestone DR, et al. Multiday cycles of heart rate. Nat Commun. 2021;12:1-10. doi:10.1038/s41467-021-22452-5',
      ),
    ).toBe(true)
    expect(
      looksLikeBibliographyEntry(
        'Phenytoin within 7 days reduced early seizures in the 1990 trial of 404 patients.',
      ),
    ).toBe(false)
  })

  it('cuts the reference section and stray entries from a text', () => {
    const text = [
      'Levetiracetam was non-inferior to phenytoin for early seizure prophylaxis.',
      '',
      'References',
      '1. Temkin NR, Dikmen SS. A randomized double-blind study of phenytoin. N Engl J Med. 1990;323:497-502.',
      '2. Jones KE, Puccio AM. Levetiracetam versus phenytoin. Neurosurg Focus. 2008;25(4):E3.',
      '41. Temkin NR. More harm than good: antiseizure prophylaxis. Neurology. 2001;56:32-38.',
    ].join('\n')
    const stripped = stripReferenceSection(text)
    expect(stripped).toContain('non-inferior')
    expect(stripped).not.toContain('More harm than good')
    expect(stripped).not.toContain('References')
  })
})
