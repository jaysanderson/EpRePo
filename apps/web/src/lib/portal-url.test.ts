import { expect } from '@std/expect'
import { portalHref } from './portal-url.ts'

Deno.test('portalHref uses a tenant custom domain on CorpusKit production hosts', () => {
  expect(portalHref('frdc', {
    hostname: 'frdc.corpuskit.org',
    currentHostname: 'corpuskit.org',
  })).toBe(
    'https://frdc.corpuskit.org/t/frdc',
  )
  expect(portalHref('grdc', {
    hostname: 'grdc.corpuskit.org',
    suffix: '/search?q=wheat',
    currentHostname: 'frdc.corpuskit.org',
  })).toBe(
    'https://grdc.corpuskit.org/t/grdc/search?q=wheat',
  )
})

Deno.test('portalHref keeps portals without a configured hostname relative', () => {
  expect(portalHref('new-portal', { currentHostname: 'corpuskit.org' })).toBe('/t/new-portal')
})

Deno.test('portalHref keeps local, preview and same-host navigation relative', () => {
  expect(portalHref('frdc', {
    hostname: 'frdc.corpuskit.org',
    suffix: '/library',
    currentHostname: '127.0.0.1',
  })).toBe('/t/frdc/library')
  expect(portalHref('grdc', {
    hostname: 'grdc.corpuskit.org',
    currentHostname: 'corpuskit.test',
  })).toBe('/t/grdc')
  expect(portalHref('frdc', {
    hostname: 'frdc.corpuskit.org',
    currentHostname: 'corpuskit.noice.net.au',
  })).toBe('/t/frdc')
  expect(portalHref('frdc', {
    hostname: 'frdc.corpuskit.org',
    currentHostname: 'frdc.corpuskit.org',
  })).toBe('/t/frdc')
})
