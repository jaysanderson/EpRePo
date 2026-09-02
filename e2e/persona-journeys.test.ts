// ---------------------------------------------------------------------------
// Browser E2E persona journeys - CI-runnable, no real ARAG account.
//
// Drives a real headless Chromium (via @astral/astral) against the built SPA
// served by the production Hono app (apps/api/src/app.ts), with only the
// RetrievalProvider swapped for a deterministic test double (see
// e2e/support/double-provider.ts). Everything else - routing, SSE streaming,
// tenant config, static file serving - is the real production code path.
//
// Journeys assert what docs/PERSONAS.md's persona gates require of the
// researcher journey: the CorpusKit front door, the explore page's topic rows, the
// search page's cited AI Answer panel (inline [n] markers, resources/cited
// header, Retrieved/Cited toggle), a citation marker's click-through to
// its source, the Self Assessment page's knowledge-area cards, and that the
// search journey stays usable at a 390px mobile viewport.
//
// Run with `deno task test:e2e` - NOT part of plain `deno task test` (the
// unit gate), since e2e/ sits outside the packages/ and apps/ roots that
// task scans, and downloading/driving a real browser is much slower than
// the unit suite.
// ---------------------------------------------------------------------------
import { afterAll, beforeAll, describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { type Browser, launch } from '@astral/astral'
import { RESOURCE_ONE } from './support/double-provider.ts'
import { startTestServer, type TestServer } from './support/test-server.ts'

let browser: Browser
let server: TestServer

beforeAll(async () => {
  server = startTestServer()
  browser = await launch()
})

afterAll(async () => {
  await browser.close()
  await server.close()
})

describe('CorpusKit front door', () => {
  it('explains the product and presents the ways to take part', async () => {
    const page = await browser.newPage(`${server.url}/`)
    try {
      await page.waitForSelector('h1')
      const bodyText = await page.evaluate(() => document.body.innerText)
      expect(bodyText).toContain('Put your organisation’s')
      expect(bodyText).toContain('Inside a CorpusKit portal')
      expect(bodyText).toContain('Run CorpusKit with your collection')
      expect(bodyText).toContain('Be a part of CorpusKit')
    } finally {
      await page.close()
    }
  })

  it('keeps the marketing front door usable at a 390px viewport', async () => {
    const page = await browser.newPage(`${server.url}/`)
    try {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForSelector('#contribute')
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '137.5%'
      })
      const state = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
        heading: document.querySelector('h1')?.textContent?.trim(),
        headingOverflow: (() => {
          const heading = document.querySelector<HTMLElement>('.hero h1')
          return heading ? heading.scrollWidth - heading.clientWidth : 10_000
        })(),
        pageInset: document.querySelector<HTMLElement>('.hero')?.getBoundingClientRect().left ?? 0,
        nextSteps: document.querySelectorAll('.next-step').length,
      }))
      expect(state.horizontalOverflow).toBeLessThanOrEqual(0)
      expect(state.heading).toContain('Put your organisation’s')
      expect(state.headingOverflow).toBeLessThanOrEqual(0)
      expect(state.pageInset).toBeGreaterThanOrEqual(24)
      expect(state.nextSteps).toBe(3)
    } finally {
      await page.close()
    }
  })

  it('aligns the How it works link with the pinned walkthrough', async () => {
    const page = await browser.newPage(`${server.url}/`)
    try {
      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.reload()
      await page.waitForSelector('#workings')
      await page.evaluate(() => {
        document.querySelector<HTMLAnchorElement>('a[href="#workings"]')?.click()
      })
      await page.evaluate(async () => await new Promise((resolve) => setTimeout(resolve, 1_200)))

      const arrival = await page.evaluate(() => ({
        hash: location.hash,
        sectionTop: document.querySelector('#workings')?.getBoundingClientRect().top,
        headerTheme: document.querySelector('.site-header')?.className,
        activeFeature: document.querySelector('.view-tab.active')?.textContent?.trim(),
      }))
      expect(arrival.hash).toBe('#workings')
      expect(Math.abs((arrival.sectionTop ?? 0) - 76)).toBeLessThanOrEqual(2)
      expect(arrival.headerTheme).toContain('nav-dark')
      expect(arrival.activeFeature).toBe('Ask')

      await page.evaluate(() => globalThis.scrollBy(0, 900))
      await page.evaluate(async () => await new Promise((resolve) => setTimeout(resolve, 800)))
      const activeFeature = await page.evaluate(() =>
        document.querySelector('.view-tab.active')?.textContent?.trim()
      )
      expect(activeFeature).toBe('Search')
    } finally {
      await page.close()
    }
  })
})

describe('explore page', () => {
  it('renders topic rows with resource cards', async () => {
    const page = await browser.newPage(`${server.url}/t/frdc`)
    try {
      // Topic row heading for the current topic the double's resources are
      // filed against ("research-development").
      await page.waitForSelector('h2', { timeout: 15_000 })
      const bodyText = await page.evaluate(() => document.body.innerText)
      expect(bodyText).toContain('Research and development')
      expect(bodyText).toContain(RESOURCE_ONE.title)
    } finally {
      await page.close()
    }
  })
})

describe('Ask and Tools navigation', () => {
  it('redirects an old Assistant bookmark to Ask and presents the renamed surface', async () => {
    const page = await browser.newPage(`${server.url}/t/frdc/assistant`)
    try {
      await page.waitForSelector('main[aria-label="Ask"]', { timeout: 15_000 })

      const state = await page.evaluate(() => ({
        pathname: location.pathname,
        title: document.title,
        text: document.body.innerText,
      }))
      expect(state.pathname).toBe('/t/frdc/ask')
      expect(state.title).toBe('Ask | FRDC Knowledge Hub')
      expect(state.text).toContain('Ask a question and get an answer grounded in this portal')
    } finally {
      await page.close()
    }
  })

  it('lists Tools as one navigation destination and renders its placeholder', async () => {
    const page = await browser.newPage(`${server.url}/t/frdc/tools`)
    try {
      await page.waitForSelector('h1', { timeout: 15_000 })

      const state = await page.evaluate(() => {
        const primaryLinks = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('header nav[aria-label="Primary"] a'),
        ).map((link) => ({ href: link.getAttribute('href'), label: link.textContent?.trim() }))
        return {
          title: document.title,
          heading: document.querySelector('h1')?.textContent?.trim(),
          text: document.body.innerText,
          primaryLinks,
        }
      })

      expect(state.title).toBe('Tools | FRDC Knowledge Hub')
      expect(state.heading).toBe('Tools')
      // The Tools page now leads with the MCP connector rather than the
      // placeholder it shipped with. Assert on the tool itself, which is
      // described to every visitor; only provisioning is admin-gated, and the
      // E2E double has no admin session.
      expect(state.text).toContain('Knowledge box MCP connector')
      expect(state.primaryLinks).toContainEqual({ href: '/t/frdc/ask', label: 'Ask' })
      expect(state.primaryLinks).toContainEqual({ href: '/t/frdc/tools', label: 'Tools' })
      expect(state.primaryLinks.some((link) => link.href === '/t/frdc/generate')).toBe(false)
    } finally {
      await page.close()
    }
  })
})

describe('search - AI answer panel and citations', () => {
  it('shows the AI Answer panel with an inline citation marker, the resources/cited header and the toggle', async () => {
    const page = await browser.newPage(`${server.url}/t/frdc/search?q=abalone`)
    try {
      await page.waitForSelector('[aria-label="AI answer"]', { timeout: 15_000 })

      // Inline `[1]` citation marker rendered as a superscript link.
      await page.waitForSelector('sup a', { timeout: 15_000 })
      const markerText = await (await page.$('sup a'))?.innerText()
      expect(markerText).toBe('[1]')

      // The resources/cited count header - waits for the answer's citation
      // to have been reported up to the results list ("1 cited").
      await page.waitForFunction(() => document.body.innerText.includes('1 cited'))

      // Retrieved/Cited toggle (role=radiogroup, aria-label="Results view").
      const bodyText = await page.evaluate(() => document.body.innerText)
      expect(bodyText).toMatch(/Retrieved \(\d+\)/)
      expect(bodyText).toMatch(/Cited \(\d+\)/)
    } finally {
      await page.close()
    }
  })

  it('a citation marker click targets the right source', async () => {
    const page = await browser.newPage(`${server.url}/t/frdc/search?q=abalone`)
    try {
      const marker = await page.waitForSelector('sup a', { timeout: 15_000 })
      await marker.click()
      // A citation marker is a react-router <Link> - a client-side route
      // change (history.pushState), not a full navigation - so this waits
      // for the URL to change rather than for a load/network event.
      await page.waitForFunction(() => location.pathname.includes('/library/'))
      await page.waitForSelector('h1', { timeout: 15_000 })

      // astral's `page.url` only updates on a full Page.frameNavigated event,
      // which a react-router client-side route change never fires - read the
      // live location from the page itself instead.
      const pathname = await page.evaluate(() => location.pathname)
      expect(pathname).toBe(`/t/frdc/library/${RESOURCE_ONE.id}`)
      const heading = await (await page.$('h1'))?.innerText()
      expect(heading).toContain(RESOURCE_ONE.title)
    } finally {
      await page.close()
    }
  })
})

describe('assessment page', () => {
  it('renders its knowledge-area cards', async () => {
    const page = await browser.newPage(`${server.url}/t/frdc/assessment`)
    try {
      await page.waitForSelector('h1', { timeout: 15_000 })
      const heading = await (await page.$('h1'))?.innerText()
      expect(heading).toContain('Industry Knowledge Areas')

      const bodyText = await page.evaluate(() => document.body.innerText)
      // One card per configured frdc topic.
      expect(bodyText).toContain('Research and development')
      expect(bodyText).toContain('Carp control')
      expect(bodyText).toContain('Build an assessment')
    } finally {
      await page.close()
    }
  })
})

describe('390px mobile viewport', () => {
  it('keeps the search journey usable - no horizontal body scroll, tap targets reachable', async () => {
    const page = await browser.newPage()
    try {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${server.url}/t/frdc/search?q=abalone`, { waitUntil: 'load' })
      await page.waitForSelector('[aria-label="AI answer"]', { timeout: 15_000 })
      await page.waitForSelector('sup a', { timeout: 15_000 })

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

      // The page-level search input stays within the viewport and remains a
      // reachable tap target. On mobile, the keyboard Search action submits
      // this form; the desktop header's submit button is intentionally hidden.
      const field = await page.evaluate(() => {
        const input = document.getElementById('search-query') as HTMLInputElement | null
        const rectOf = (el: Element | null | undefined) => {
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: r.x, right: r.right, width: r.width, height: r.height }
        }
        return { rect: rectOf(input), enterKeyHint: input?.enterKeyHint }
      })

      expect(field.rect).not.toBeNull()
      expect(field.rect!.x).toBeGreaterThanOrEqual(0)
      expect(field.rect!.right).toBeLessThanOrEqual(390)
      expect(field.rect!.width).toBeGreaterThan(0)
      expect(field.rect!.height).toBeGreaterThan(0)
      expect(field.enterKeyHint).toBe('search')

      // The citation marker link is likewise on-screen and clickable.
      const markerRect = await page.evaluate(() => {
        const marker = document.querySelector('sup a')
        if (!marker) return null
        const r = marker.getBoundingClientRect()
        return { x: r.x, right: r.right, width: r.width, height: r.height }
      })
      expect(markerRect).not.toBeNull()
      expect(markerRect!.right).toBeLessThanOrEqual(390)
      expect(markerRect!.width).toBeGreaterThan(0)
    } finally {
      await page.close()
    }
  })
})
