import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  figureOffsets,
  hasBodyHeadings,
  markedSentences,
  secondhandFigures,
  secondhandNote,
  sectionAt,
  sectionSpans,
} from './secondhand.ts'

const PAPER = [
  ' Rituximab Use for Relapse Prevention ',
  ' Abstract ',
  ' Background and Objectives: We examined rituximab. ',
  ' Methods: A multicenter cohort of 67 patients. ',
  ' Results: A single course was associated with longer time to relapse (HR 0.11). ',
  ' Introduction ',
  ' Rituximab reduced the odds of relapse by 83% in a meta-analysis.9 ',
  ' 2 | METHODS ',
  ' We identified 67 patients across 10 hospitals. ',
  ' 3 | RESULTS ',
  ' The hazard ratio for first relapse was 0.11 (95% CI 0.02-0.70) with 2,698 person-months. ',
  ' 4 | DISCUSSION ',
  ' Earlier work reported relapse in 12% to 35% of patients. ',
  ' References ',
  ' 9. Some meta-analysis. ',
].join('\n')

describe('sectionSpans', () => {
  it('places each heading and keeps a structured abstract together', () => {
    const spans = sectionSpans(PAPER)
    expect(spans.map((s) => s.section)).toEqual([
      'other',
      'abstract',
      'introduction',
      'methods',
      'results',
      'discussion',
      'references',
    ])
    expect(hasBodyHeadings(spans)).toBe(true)
    expect(sectionAt(spans, PAPER.indexOf('83%'))).toBe('introduction')
    expect(sectionAt(spans, PAPER.indexOf('HR 0.11'))).toBe('abstract')
    expect(sectionAt(spans, PAPER.indexOf('2,698'))).toBe('results')
  })
  it('reports no body headings for a text without them', () => {
    const spans = sectionSpans('Just a paragraph with 12% and no headings at all.')
    expect(hasBodyHeadings(spans)).toBe(false)
  })
})

describe('figureOffsets', () => {
  it('matches a figure with or without a thousands separator, never inside a longer number', () => {
    expect(figureOffsets('2698', 'n = 2,698 and 12698 and 2698.')).toEqual([4, 24])
    expect(figureOffsets('0.11', 'HR 0.11 and 10.11')).toEqual([3])
    expect(figureOffsets('83%', 'by 83% in')).toEqual([3])
    expect(figureOffsets('14%', '14 days and 14 % and 14%')).toEqual([12, 21])
  })
})

describe('secondhandFigures', () => {
  const texts = new Map([[1, PAPER]])
  it('flags a figure that appears only in the introduction or discussion', () => {
    const found = secondhandFigures(
      [
        { text: 'Rituximab reduced the odds of relapse by 83%.', bound: [1] },
        { text: 'Relapse occurred in 35% of patients.', bound: [1] },
      ],
      texts,
    )
    expect(found).toEqual([{ figure: '83%', index: 1 }, { figure: '35%', index: 1 }])
  })
  it('leaves a figure from the abstract, results or methods alone, and an absent one to the audit', () => {
    expect(
      secondhandFigures(
        [{ text: 'The hazard ratio was 0.11 across 67 patients and 99% of nothing.', bound: [1] }],
        texts,
      ),
    ).toEqual([])
  })
  it('never judges a paper without body headings', () => {
    expect(
      secondhandFigures([{ text: 'A 12% rate.', bound: [1] }], new Map([[1, 'Only 12% here.']])),
    ).toEqual([])
  })
})

describe('markedSentences and secondhandNote', () => {
  it('splits marked lines into sentences with their markers and skips addendum lines', () => {
    expect(
      markedSentences(
        'First claim 83%.[1] Second claim.[2][3]\n\n*Denominators: none.*\nUnmarked.',
      ),
    ).toEqual([
      { text: 'First claim 83%.', bound: [1] },
      { text: 'Second claim.', bound: [2, 3] },
    ])
  })
  it('writes one line naming the figures and their markers', () => {
    expect(secondhandNote([])).toBeUndefined()
    expect(secondhandNote([{ figure: '83%', index: 2 }])).toBe(
      '*Second-hand figures: 83% [2] appears in the cited paper only in its introduction or ' +
        'discussion, where it cites other studies, not among its own results.*',
    )
  })
})
