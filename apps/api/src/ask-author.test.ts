import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import type { ResourceSummary } from '@research-portal/core'
import {
  authorsNamed,
  authorTopicQuery,
  correctAttributions,
  hasAuthor,
  surnameOf,
} from './ask-author.ts'

const resource = (id: string, authors: string[]): ResourceSummary => ({
  id,
  title: id,
  type: 'pdf',
  authors,
} as ResourceSummary)

const catalogue = [
  resource('cycles', ['Karoly PJ', 'Stirling RE', "D'Souza W", 'Cook MJ']),
  resource('forecast', ['Xiong W', 'Stirling RE', 'Payne DE', 'Karoly PJ']),
  resource('app', ['Reynolds A', 'Stirling RE', 'Peterson A']),
]

describe('author index', () => {
  it('reads surnames from the catalogue author forms', () => {
    expect(surnameOf("D'Souza W")).toBe("D'Souza")
    expect(surnameOf('Vajda FJE')).toBe('Vajda')
    expect(surnameOf('A. B. Surname')).toBe('Surname')
    expect(hasAuthor({ authors: ['D’Souza W'] }, "D'Souza")).toBe(true)
  })

  it('recognises the surnames a question names and the papers they wrote', () => {
    const named = authorsNamed(
      "What has D'Souza and colleagues published on multiday seizure cycles and Dravet?",
      catalogue,
      ['Dravet'],
    )
    expect(named).toEqual([{ surname: "D'Souza", resourceIds: ['cycles'] }])
    expect(authorsNamed('What is known about multiday seizure cycles?', catalogue)).toEqual([])
  })
})

describe('correctAttributions', () => {
  const authors = [{ surname: "D'Souza", resourceIds: ['cycles'] }]
  const citations = [
    { index: 1, resourceId: 'cycles', title: 'cycles' },
    { index: 2, resourceId: 'forecast', title: 'forecast' },
    { index: 3, resourceId: 'app', title: 'app' },
  ]
  const authorsOf = (id: string) => catalogue.find((r) => r.id === id)?.authors

  it('keeps an attribution the cited paper supports', () => {
    const text = "D'Souza and colleagues found multiday cycles in all participants.[1]"
    expect(correctAttributions(text, authors, citations, authorsOf)).toEqual({ text, fixes: [] })
  })

  it("rewrites to the cited paper's first author when it lacks the named one", () => {
    const text = "D'Souza and colleagues reported a mean AUC of 0.77.[2]"
    const out = correctAttributions(text, authors, citations, authorsOf)
    expect(out.text).toBe('Xiong and colleagues reported a mean AUC of 0.77.[2]')
    expect(out.fixes).toHaveLength(1)
  })

  it('uses a neutral subject when several first authors are cited', () => {
    const text = "D'Souza et al. explored forecasting apps.[2][3] The next sentence stands.[1]"
    const out = correctAttributions(text, authors, citations, authorsOf)
    expect(out.text).toBe(
      'Other authors explored forecasting apps.[2][3] The next sentence stands.[1]',
    )
  })

  it('leaves an unmarked sentence alone', () => {
    const text = "D'Souza and colleagues have contributed to this field."
    expect(correctAttributions(text, authors, citations, authorsOf).text).toBe(text)
  })
})

describe('authorTopicQuery', () => {
  it('keeps the topic and drops the attribution scaffolding', () => {
    expect(
      authorTopicQuery(
        "What has D'Souza and colleagues published on seizure cycles and forecasting?",
        [
          "D'Souza",
        ],
      ),
    ).toBe('seizure cycles and forecasting')
    expect(authorTopicQuery('Summarise the Karoly group work on wearables', ['Karoly'])).toBe(
      'Summarise wearables',
    )
  })
  it('is empty when only scaffolding remains', () => {
    expect(authorTopicQuery("What has D'Souza published?", ["D'Souza"])).toBe('')
  })
})
