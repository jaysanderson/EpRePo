import { expect } from '@std/expect'
import { portalHref } from './portal-url.ts'

Deno.test('portalHref uses a tenant custom domain on CorpusKit production hosts', () => {
  expect(portalHref('frdc', '', 'corpuskit.org')).toBe(
    'https://frdc.corpuskit.org/t/frdc',
  )
  expect(portalHref('grdc', '/search?q=wheat', 'frdc.corpuskit.org')).toBe(
    'https://grdc.corpuskit.org/t/grdc/search?q=wheat',
  )
})

Deno.test('portalHref keeps local and preview navigation relative', () => {
  expect(portalHref('frdc', '/library', '127.0.0.1')).toBe('/t/frdc/library')
  expect(portalHref('grdc', '', 'corpuskit.test')).toBe('/t/grdc')
})
