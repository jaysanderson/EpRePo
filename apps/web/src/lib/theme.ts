import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import {
  type DensityId,
  FONT_PAIRINGS,
  type FontPairingId,
  FontPairingIdSchema,
  type ShapeId,
  type TenantConfig,
  type TextScaleId,
} from '@research-portal/core'

type Branding = TenantConfig['branding']

/**
 * Tenant theming: turns branding (colours, typography, shape) into the CSS
 * custom properties the token layer in styles.css reads, and loads whichever
 * font faces the choice needs. The pure functions here are the single mapping
 * from a branding document to theme vars; TenantLayout applies them inline on
 * the tenant wrapper so everything inside re-themes.
 */

export const PAIRING_IDS: readonly FontPairingId[] = FontPairingIdSchema.options

const SANS_FALLBACK = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif'

/** Families used by @font-face rules for uploaded custom fonts. */
export const CUSTOM_HEADING_FAMILY = 'RP Custom Heading'
export const CUSTOM_BODY_FAMILY = 'RP Custom Body'

/**
 * The radius each shape gives every dial. Surfaces round more than controls in
 * 'soft'; buttons and chips go full pill there while inputs stay moderate so a
 * multi-line textarea never renders as a lozenge.
 */
export const SHAPE_RADII: Record<
  ShapeId,
  { surface: string; btn: string; chip: string; input: string }
> = {
  square: { surface: '0px', btn: '0px', chip: '0px', input: '0px' },
  rounded: { surface: '10px', btn: '8px', chip: '8px', input: '8px' },
  soft: { surface: '16px', btn: '9999px', chip: '9999px', input: '14px' },
}

export function fontStack(family: string): string {
  return `'${family}', ${SANS_FALLBACK}`
}

/**
 * Root font-size per text-scale choice. The whole interface is rem-based, so
 * scaling the root scales text and its tied spacing together, like browser
 * zoom - proportions and reading measures survive. null means leave the
 * browser default (the user's own setting) alone.
 */
export const TEXT_SCALES: Record<TextScaleId, string | null> = {
  default: null,
  smaller: '93.75%',
  larger: '106.25%',
}

/** Apply the tenant's text scale to the document root (no-op for default). */
export function useTextScale(branding: Branding | undefined): void {
  const scale = branding?.textScale ?? 'default'
  useEffect(() => {
    const value = TEXT_SCALES[scale]
    if (value) document.documentElement.style.fontSize = value
    else document.documentElement.style.removeProperty('font-size')
    return () => {
      document.documentElement.style.removeProperty('font-size')
    }
  }, [scale])
}

export function shapeVars(shape: Branding['shape']): Record<string, string> {
  const radii = SHAPE_RADII[shape ?? 'square']
  return {
    '--rp-radius': radii.surface,
    '--rp-radius-btn': radii.btn,
    '--rp-radius-chip': radii.chip,
    '--rp-radius-input': radii.input,
  }
}

/**
 * The two density dials per level. `rhythm` rescales the Tailwind spacing
 * scale (paddings, gaps, stacks - see .rp-tenant in styles.css); `ctl` is
 * deliberately damped so buttons, chips and inputs move less than the space
 * around them. Text sizes never ride either dial.
 */
export const DENSITY_DIALS: Record<DensityId, { rhythm: number; ctl: number }> = {
  compact: { rhythm: 0.85, ctl: 0.93 },
  default: { rhythm: 1, ctl: 1 },
  comfortable: { rhythm: 1.2, ctl: 1.06 },
  spacious: { rhythm: 1.4, ctl: 1.12 },
}

export function densityVars(density: Branding['density']): Record<string, string> {
  const dials = DENSITY_DIALS[density ?? 'default']
  return {
    '--rp-density': String(dials.rhythm),
    '--rp-density-ctl': String(dials.ctl),
  }
}

export function typographyVars(branding: Branding): Record<string, string> {
  const choice = branding.typography
  if (!choice || choice === 'default') {
    // 'default' means this portal's own default: its seeded brand faces when
    // it has them (e.g. GRDC's Montserrat), else the house faces from :root.
    if (!branding.fonts) return {}
    return {
      '--rp-font-body': branding.fonts.sans,
      '--rp-font-display': branding.fonts.display,
    }
  }
  if (choice === 'custom') {
    return {
      ...(branding.headingFontUrl ? { '--rp-font-display': fontStack(CUSTOM_HEADING_FAMILY) } : {}),
      ...(branding.bodyFontUrl ? { '--rp-font-body': fontStack(CUSTOM_BODY_FAMILY) } : {}),
    }
  }
  const pairing = FONT_PAIRINGS[choice]
  return {
    '--rp-font-display': fontStack(pairing.heading.family),
    '--rp-font-display-weight': String(pairing.heading.weight),
    '--rp-font-display-bold-weight': String(pairing.heading.boldWeight),
    '--rp-font-display-tracking': pairing.heading.tracking,
    '--rp-font-display-leading': pairing.heading.leading,
    '--rp-font-body': fontStack(pairing.body.family),
    '--rp-font-body-weight': String(pairing.body.weight),
  }
}

/** Every theme var the tenant wrapper sets inline - colours, faces, radii, density. */
export function tenantThemeVars(branding: Branding): CSSProperties {
  return {
    '--rp-primary': branding.colours.primary,
    '--rp-accent': branding.colours.accent,
    '--rp-hero-from': branding.colours.heroFrom,
    '--rp-hero-to': branding.colours.heroTo,
    ...typographyVars(branding),
    ...shapeVars(branding.shape),
    ...densityVars(branding.density),
  } as CSSProperties
}

/**
 * Mirror the tenant theme onto <body>. Overlays that portal to document.body
 * (command palette, sheets, the answer journey) render outside the tenant
 * wrapper and would otherwise fall back to the house theme - fonts, shape
 * and density alike. Applied while a tenant layout is mounted, removed when
 * it unmounts, so non-tenant routes keep the neutral defaults.
 */
export function useBodyTheme(branding: Branding | undefined): void {
  useEffect(() => {
    if (!branding) return
    const vars = tenantThemeVars(branding) as Record<string, string>
    document.body.classList.add('rp-tenant')
    for (const [name, value] of Object.entries(vars)) {
      document.body.style.setProperty(name, value)
    }
    return () => {
      document.body.classList.remove('rp-tenant')
      for (const name of Object.keys(vars)) document.body.style.removeProperty(name)
    }
  }, [branding])
}

export function googleFontsUrl(id: FontPairingId): string {
  return `https://fonts.googleapis.com/css2?${FONT_PAIRINGS[id].googleQuery}&display=swap`
}

/** Idempotently add the stylesheet for one pairing to <head>. */
export function loadPairingFonts(id: FontPairingId): void {
  const elementId = `rp-fonts-${id}`
  if (document.getElementById(elementId)) return
  const link = document.createElement('link')
  link.id = elementId
  link.rel = 'stylesheet'
  link.href = googleFontsUrl(id)
  document.head.appendChild(link)
}

export function customFontCss(headingFontUrl?: string, bodyFontUrl?: string): string {
  const face = (family: string, url: string) =>
    `@font-face{font-family:'${family}';src:url('${url}');font-weight:100 900;font-display:swap;}`
  return [
    headingFontUrl ? face(CUSTOM_HEADING_FAMILY, headingFontUrl) : '',
    bodyFontUrl ? face(CUSTOM_BODY_FAMILY, bodyFontUrl) : '',
  ].filter(Boolean).join('\n')
}

/**
 * Load whatever faces the tenant's typography choice needs: a Google Fonts
 * stylesheet for a pairing, or @font-face rules over the uploaded files for
 * 'custom'. Loaded faces stay in <head> (they are cached; switching back is
 * instant) - only the custom rules are refreshed, since an upload replaces
 * the file behind the same URL.
 */
export function useTenantFonts(branding: Branding | undefined): void {
  const choice = branding?.typography
  const headingFontUrl = branding?.headingFontUrl
  const bodyFontUrl = branding?.bodyFontUrl
  useEffect(() => {
    if (!choice || choice === 'default') return
    if (choice !== 'custom') {
      loadPairingFonts(choice)
      return
    }
    const css = customFontCss(headingFontUrl, bodyFontUrl)
    const existing = document.getElementById('rp-fonts-custom')
    if (existing) {
      if (existing.textContent !== css) existing.textContent = css
      return
    }
    const style = document.createElement('style')
    style.id = 'rp-fonts-custom'
    style.textContent = css
    document.head.appendChild(style)
  }, [choice, headingFontUrl, bodyFontUrl])
}

/** Preload every pairing's faces - the Appearance tab shows live previews of all of them. */
export function useAllPairingFonts(): void {
  useEffect(() => {
    for (const id of PAIRING_IDS) loadPairingFonts(id)
  }, [])
}
