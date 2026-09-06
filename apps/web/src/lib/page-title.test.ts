import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { pageTitle, surfaceName } from './page-title.ts'

describe('per-route page titles (D6-14)', () => {
  it('names every surface of a portal', () => {
    expect(surfaceName('/t/eprepo')).toBeUndefined()
    expect(surfaceName('/t/eprepo/')).toBeUndefined()
    expect(surfaceName('/t/eprepo/search')).toBe('Search')
    expect(surfaceName('/t/eprepo/library')).toBe('Library')
    expect(surfaceName('/t/eprepo/library/9cb1d5d7')).toBe('Document')
    expect(surfaceName('/t/eprepo/ask')).toBe('Ask')
    expect(surfaceName('/t/eprepo/ask/session-1')).toBe('Ask')
    expect(surfaceName('/t/eprepo/investigations')).toBe('Investigations')
    expect(surfaceName('/t/eprepo/investigations/abc')).toBe('Investigation')
    expect(surfaceName('/t/eprepo/generate')).toBe('Generate')
    expect(surfaceName('/t/eprepo/assessment')).toBe('Assessment')
    expect(surfaceName('/t/eprepo/graph')).toBe('Knowledge graph')
    expect(surfaceName('/t/eprepo/tools')).toBe('Tools')
    expect(surfaceName('/t/eprepo/help')).toBe('Help')
    expect(surfaceName('/t/eprepo/help/trust-and-citations')).toBe('Help')
    expect(surfaceName('/t/eprepo/how-it-works')).toBe('How this works')
    expect(surfaceName('/t/eprepo/taxonomy')).toBe('Taxonomy')
  })

  it('names an entity page for its entity', () => {
    expect(surfaceName('/t/eprepo/entity/Levetiracetam')).toBe('Levetiracetam')
    expect(surfaceName('/t/eprepo/entity/anti-LGI1%20encephalitis')).toBe('anti-LGI1 encephalitis')
  })

  it('falls back to the product name alone, never to a broken suffix', () => {
    expect(pageTitle('/t/eprepo', 'EpRePo Research Portal')).toBe('EpRePo Research Portal')
    expect(pageTitle('/t/eprepo/library', 'EpRePo Research Portal')).toBe(
      'Library | EpRePo Research Portal',
    )
    expect(pageTitle('/t/eprepo/nowhere', 'EpRePo Research Portal')).toBe('EpRePo Research Portal')
  })
})
