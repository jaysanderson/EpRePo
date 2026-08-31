import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import type { TenantConfig } from '@research-portal/core'
import {
  customFontCss,
  fontStack,
  googleFontsUrl,
  PAIRING_IDS,
  shapeVars,
  tenantThemeVars,
  TEXT_SCALES,
  typographyVars,
} from './theme.ts'

const branding = (over: Partial<TenantConfig['branding']> = {}): TenantConfig['branding'] => ({
  productName: 'Test Portal',
  organisation: 'Test Org',
  tagline: 'Testing',
  colours: { primary: '#111111', accent: '#222222', heroFrom: '#333333', heroTo: '#444444' },
  ...over,
})

describe('shapeVars', () => {
  it('defaults to square (all dials 0)', () => {
    expect(shapeVars(undefined)).toEqual({
      '--rp-radius': '0px',
      '--rp-radius-btn': '0px',
      '--rp-radius-chip': '0px',
      '--rp-radius-input': '0px',
    })
  })

  it('rounds everything slightly for rounded', () => {
    const vars = shapeVars('rounded')
    expect(vars['--rp-radius']).toBe('10px')
    expect(vars['--rp-radius-btn']).toBe('8px')
    expect(vars['--rp-radius-chip']).toBe('8px')
  })

  it('pills buttons and chips for soft, but keeps inputs moderate', () => {
    const vars = shapeVars('soft')
    expect(vars['--rp-radius']).toBe('16px')
    expect(vars['--rp-radius-btn']).toBe('9999px')
    expect(vars['--rp-radius-chip']).toBe('9999px')
    expect(vars['--rp-radius-input']).not.toBe('9999px')
  })
})

describe('typographyVars', () => {
  it('sets nothing for the default choice, so the house faces stay', () => {
    expect(typographyVars(branding())).toEqual({})
    expect(typographyVars(branding({ typography: 'default' }))).toEqual({})
  })

  it('sets both faces and their metrics for a pairing', () => {
    const vars = typographyVars(branding({ typography: 'bebas-heebo' }))
    expect(vars['--rp-font-display']).toContain("'Bebas Neue'")
    expect(vars['--rp-font-body']).toContain("'Heebo'")
    // Heebo Light: the pairing carries a 300 base body weight.
    expect(vars['--rp-font-body-weight']).toBe('300')
    expect(vars['--rp-font-display-weight']).toBe('400')
  })

  it('every pairing carries a full metric set and a fallback stack', () => {
    for (const id of PAIRING_IDS) {
      const vars = typographyVars(branding({ typography: id }))
      for (
        const key of [
          '--rp-font-display',
          '--rp-font-display-weight',
          '--rp-font-display-bold-weight',
          '--rp-font-display-tracking',
          '--rp-font-display-leading',
          '--rp-font-body',
          '--rp-font-body-weight',
        ]
      ) {
        expect(vars[key]).toBeTruthy()
      }
      expect(vars['--rp-font-display']).toContain('sans-serif')
      expect(vars['--rp-font-body']).toContain('sans-serif')
    }
  })

  it('only overrides the faces that have uploaded files for custom', () => {
    expect(typographyVars(branding({ typography: 'custom' }))).toEqual({})
    const headingOnly = typographyVars(
      branding({ typography: 'custom', headingFontUrl: '/api/t/x/branding/font-heading?v=1' }),
    )
    expect(headingOnly['--rp-font-display']).toContain('RP Custom Heading')
    expect(headingOnly['--rp-font-body']).toBeUndefined()
  })
})

describe('tenantThemeVars', () => {
  it('always carries the four tenant colours plus the shape dials', () => {
    const vars = tenantThemeVars(branding()) as Record<string, string>
    expect(vars['--rp-primary']).toBe('#111111')
    expect(vars['--rp-accent']).toBe('#222222')
    expect(vars['--rp-hero-from']).toBe('#333333')
    expect(vars['--rp-hero-to']).toBe('#444444')
    expect(vars['--rp-radius']).toBe('0px')
  })
})

describe('googleFontsUrl', () => {
  it('builds a css2 URL with display=swap for every pairing', () => {
    for (const id of PAIRING_IDS) {
      const url = googleFontsUrl(id)
      expect(url.startsWith('https://fonts.googleapis.com/css2?family=')).toBe(true)
      expect(url.endsWith('&display=swap')).toBe(true)
    }
  })
})

describe('customFontCss', () => {
  it('emits a @font-face per uploaded file only', () => {
    expect(customFontCss(undefined, undefined)).toBe('')
    const both = customFontCss('/h.woff2', '/b.woff2')
    expect(both).toContain("font-family:'RP Custom Heading'")
    expect(both).toContain("font-family:'RP Custom Body'")
    expect(both).toContain("src:url('/h.woff2')")
    expect(customFontCss('/h.woff2', undefined)).not.toContain('RP Custom Body')
  })
})

describe('TEXT_SCALES', () => {
  it('leaves the root alone for default and nudges it either side otherwise', () => {
    expect(TEXT_SCALES.default).toBeNull()
    expect(TEXT_SCALES.smaller).toBe('93.75%')
    expect(TEXT_SCALES.larger).toBe('106.25%')
  })
})

describe('fontStack', () => {
  it('quotes the family and keeps a system fallback', () => {
    expect(fontStack('Zilla Slab')).toBe(
      "'Zilla Slab', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    )
  })
})
