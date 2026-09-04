import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import type { ResourceSummary } from '@research-portal/core'
import { authorLine, resolveAuthor, resolveIdentifier } from './catalog-lookup.ts'

const base = { summary: 'x', type: 'pdf' as const, topicIds: [], keyFacts: [] }
const resources: ResourceSummary[] = [
  {
    ...base,
    id: 'a',
    title: 'ENVISION natural history',
    doi: '10.1111/epi.70015',
    pmid: '39876543',
    originUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8517288/',
    authors: ['Vajda FJE', 'O’Brien TJ', 'Lander CM'],
    journal: 'Epilepsia',
    year: '2025',
  },
  {
    ...base,
    id: 'b',
    title: 'Another paper',
    doi: '10.1016/j.ebiom.2021.103619',
    pmcid: 'pmc8371239',
    authors: ['Seery N', 'Butzkueven H'],
  },
]

describe('resolveIdentifier', () => {
  it('matches a DOI regardless of prefix, case or trailing punctuation', () => {
    expect(resolveIdentifier(resources, { kind: 'doi', value: '10.1111/EPI.70015' })[0]?.id).toBe(
      'a',
    )
    expect(
      resolveIdentifier(resources, {
        kind: 'doi',
        value: 'https://doi.org/10.1016/j.ebiom.2021.103619.',
      })[0]
        ?.id,
    ).toBe('b')
    expect(resolveIdentifier(resources, { kind: 'doi', value: '10.1111/epi.17708' })).toEqual([])
  })
  it('matches a PMC id from the pmcid field or the origin URL, and a PMID', () => {
    expect(resolveIdentifier(resources, { kind: 'pmcid', value: 'PMC8371239' })[0]?.id).toBe('b')
    expect(resolveIdentifier(resources, { kind: 'pmcid', value: 'PMC8517288' })[0]?.id).toBe('a')
    expect(resolveIdentifier(resources, { kind: 'pmid', value: '39876543' })[0]?.id).toBe('a')
    expect(resolveIdentifier(resources, { kind: 'pmcid', value: 'PMC1' })).toEqual([])
  })
  it('puts the article before the supplements that share its PMC id', () => {
    const withSupplement = [
      { ...resources[1]!, id: 'supp', title: 'Supplementary material 1: extra tables' },
      resources[1]!,
    ]
    expect(
      resolveIdentifier(withSupplement, { kind: 'pmcid', value: 'PMC8371239' }).map((r) => r.id),
    )
      .toEqual(['b', 'supp'])
  })
})

describe('resolveAuthor', () => {
  it('finds resources by surname from "Surname INITIALS" author strings', () => {
    expect(resolveAuthor(resources, 'Vajda')?.matches.map((r) => r.id)).toEqual(['a'])
    expect(resolveAuthor(resources, 'seery')?.matches.map((r) => r.id)).toEqual(['b'])
    expect(resolveAuthor(resources, "O'Brien")?.matches.map((r) => r.id)).toEqual(['a'])
  })
  it('accepts a citation-shaped "Surname YYYY topic" and narrows by year', () => {
    expect(resolveAuthor(resources, 'Vajda 2025 valproate')?.matches.map((r) => r.id)).toEqual([
      'a',
    ])
    expect(resolveAuthor(resources, 'Vajda 2004 valproate')).toBeNull()
  })
  it('is null for questions, short tokens and unknown names', () => {
    expect(resolveAuthor(resources, 'Vajda valproate')).toBeNull()
    expect(resolveAuthor(resources, 'Cho')).toBeNull()
    expect(resolveAuthor(resources, 'Okafor')).toBeNull()
  })
  it('writes an author line with the journal and year', () => {
    expect(authorLine(resources[0]!)).toBe('Vajda FJE, O’Brien TJ, Lander CM - Epilepsia, 2025')
  })
})
