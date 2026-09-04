import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  attributeBriefing,
  attributeQuiz,
  resolveByQuote,
  resolveSource,
  rotateOptions,
} from './generate-sources.ts'

const sources = [
  { id: 'r1', title: 'Seizure forecasting with wearable devices', sourceName: 'PMC1234.pdf' },
  { id: 'r2', title: 'Multiday cycles of seizure risk', sourceName: 'PMC5678.pdf' },
]

describe('resolveSource', () => {
  it('matches a title exactly, case-insensitively', () => {
    expect(resolveSource('seizure forecasting with wearable devices', sources)).toEqual({
      resourceId: 'r1',
      title: 'Seizure forecasting with wearable devices',
    })
  })
  it('matches a truncated or extended title and the raw source name', () => {
    expect(resolveSource('Multiday cycles', sources)?.resourceId).toBe('r2')
    expect(resolveSource('PMC5678.pdf', sources)?.resourceId).toBe('r2')
    expect(
      resolveSource('Seizure forecasting with wearable devices (2021 cohort)', sources)
        ?.resourceId,
    ).toBe('r1')
  })
  it('never resolves an invented or trivially short label', () => {
    expect(resolveSource('Karoly et al. 2018', sources)).toBeNull()
    expect(resolveSource('PMC', sources)).toBeNull()
  })
  it('resolves a paraphrased title by content-word overlap, to the best match', () => {
    const corpus = [
      {
        id: 'a',
        title: 'Retrospective linkage study of autoimmune encephalitis in Australia: protocol',
      },
      {
        id: 'b',
        title: 'Peripheral immune cell ratios and clinical outcomes in autoimmune encephalitis',
      },
    ]
    expect(
      resolveSource('the Retrospective Linkage Study of Autoimmune Encephalitis project', corpus)
        ?.resourceId,
    ).toBe('a')
    expect(resolveSource('immune cell ratios and outcomes', corpus)?.resourceId).toBe('b')
    // Two shared generic words are not an attribution.
    expect(resolveSource('autoimmune encephalitis management guideline review', corpus)).toBeNull()
  })
})

describe('rotateOptions', () => {
  it('moves the correct option off position zero deterministically by question position', () => {
    const q = { options: ['right', 'w1', 'w2', 'w3'], correct_index: 0 }
    expect(rotateOptions(q, 0)).toEqual(q)
    expect(rotateOptions(q, 1)).toEqual({ options: ['w3', 'right', 'w1', 'w2'], correct_index: 1 })
    expect(rotateOptions(q, 3)).toEqual({ options: ['w1', 'w2', 'w3', 'right'], correct_index: 3 })
    expect(rotateOptions(q, 5)).toEqual({ options: ['w3', 'right', 'w1', 'w2'], correct_index: 1 })
  })
  it('leaves a malformed question alone', () => {
    expect(rotateOptions({ options: ['only'], correct_index: 0 }, 2)).toEqual({
      options: ['only'],
      correct_index: 0,
    })
    expect(rotateOptions({ options: ['a', 'b'], correct_index: 7 }, 1).correct_index).toBe(7)
  })
})

describe('attributeBriefing', () => {
  it('resolves per-section sources to resource ids and drops sections with none', () => {
    const out = attributeBriefing({
      title: 'Forecasting',
      sections: [
        {
          heading: 'Performance',
          content: 'AUC 0.72 to 0.92 in six participants.',
          sources: ['Seizure forecasting with wearable devices', 'Nonexistent study'],
        },
        { heading: 'Background', content: 'Generalities.', sources: [] },
        { heading: 'Cycles', content: 'Multiday cycles.', sources: ['Multiday cycles'] },
      ],
    }, sources)
    expect(out.sections).toHaveLength(2)
    expect(out.sections[0]?.sources).toEqual([
      { resourceId: 'r1', title: 'Seizure forecasting with wearable devices' },
    ])
    expect(out.sections[1]?.sources[0]?.resourceId).toBe('r2')
    expect(out.omitted_sections).toEqual(['Background'])
    expect(out.title).toBe('Forecasting')
  })
  it('de-duplicates a source named twice in one section', () => {
    const out = attributeBriefing({
      sections: [{
        heading: 'A',
        content: 'B',
        sources: ['Multiday cycles', 'PMC5678.pdf'],
      }],
    }, sources)
    expect(out.sections[0]?.sources).toHaveLength(1)
  })
})

describe('resolveByQuote', () => {
  const passages = {
    r1: [
      'Seizures were predicted above chance in all participants using an hourly forecast and in 91% using a daily forecast.',
    ],
    r2: [
      'Multiday cycles of seizure risk were detected in 89% of participants with sufficient data.',
    ],
  }
  it('resolves a verbatim or near-verbatim quote to the passage that carries it', () => {
    expect(
      resolveByQuote(
        'predicted above chance in all participants using an hourly forecast',
        passages,
      ),
    ).toBe('r1')
    expect(
      resolveByQuote('Multiday cycles of seizure risk detected in 89% of participants', passages),
    ).toBe('r2')
  })
  it('refuses a quote that no passage carries, or one too short to place', () => {
    expect(resolveByQuote('the hazard ratio for a second seizure was 0.54', passages)).toBeNull()
    expect(resolveByQuote('seizure risk', passages)).toBeNull()
  })
  it('attributeQuiz falls back to the quote when the model wrote a running header instead of a title', () => {
    const out = attributeQuiz(
      {
        questions: [{
          question: 'Q',
          options: ['a', 'b', 'c', 'd'],
          correct_index: 0,
          source: 'Journal of Neurology (2024) 271:310-324',
          source_quote:
            'seizures were predicted above chance in all participants using an hourly forecast',
        }],
      },
      sources,
      passages,
    ) as { questions: Record<string, unknown>[] }
    expect(out.questions[0]?.source_resource_id).toBe('r1')
    expect(out.questions[0]?.source_title).toBe('Seizure forecasting with wearable devices')
  })
})

describe('attributeQuiz', () => {
  it('replaces the model title with a resolved resource id and title, or nulls', () => {
    const out = attributeQuiz({
      questions: [
        { question: 'Q1', source: 'Multiday cycles of seizure risk' },
        { question: 'Q2', source: 'Made-up paper' },
        { question: 'Q3' },
      ],
    }, sources) as { questions: Record<string, unknown>[] }
    expect(out.questions[0]).toEqual({
      question: 'Q1',
      source_resource_id: 'r2',
      source_title: 'Multiday cycles of seizure risk',
      source_label: 'Multiday cycles of seizure risk',
      source_quote: null,
    })
    const rotated = attributeQuiz({
      questions: [
        { options: ['right', 'a', 'b', 'c'], correct_index: 0 },
        { options: ['right', 'a', 'b', 'c'], correct_index: 0 },
      ],
    }, sources) as { questions: { options: string[]; correct_index: number }[] }
    expect(rotated.questions[0]?.correct_index).toBe(0)
    expect(rotated.questions[1]?.correct_index).toBe(1)
    expect(rotated.questions[1]?.options[1]).toBe('right')
    expect(out.questions[1]?.source_resource_id).toBeNull()
    expect(out.questions[1]?.source).toBeUndefined()
    expect(out.questions[2]?.source_title).toBeNull()
  })
})
