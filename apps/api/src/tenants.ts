import process from 'node:process'
import { type TenantConfig, TenantConfigSchema, type TenantSummary } from '@research-portal/core'
import { readJsonSafe, writeJsonAtomic } from './persist.ts'

// ---------------------------------------------------------------------------
// Seed tenant configs - the single source of truth for tenant-driven theming
// and copy, validated at module load so a bad seed fails fast on boot.
// Persistence is deliberately plain JSON files on the volume (project rule:
// no SQLite or embedded databases unless absolutely unavoidable).
// ---------------------------------------------------------------------------

const grdc: TenantConfig = TenantConfigSchema.parse({
  slug: 'grdc',
  branding: {
    productName: 'GRDC Knowledge Hub',
    organisation: 'Grains Research and Development Corporation',
    tagline: 'Investing in RD&E for Australian grain growers',
    colours: {
      // Sampled from grdc.com.au: the nav band and footer are their charcoal,
      // the greens carry the brand.
      primary: '#28292a',
      accent: '#007945',
      heroFrom: '#007945',
      heroTo: '#004628',
    },
    logoUrl: '/brand/grdc-logo.png',
    heroImageUrl: '/brand/hero/grdc-hero.png',
    fonts: {
      sans: "'Montserrat', ui-sans-serif, system-ui, -apple-system, sans-serif",
      display: "'Montserrat', ui-sans-serif, system-ui, -apple-system, sans-serif",
    },
  },
  searchPlaceholder: 'Search agronomy, crop protection, soils, farm business…',
  // These ids must match the `topic` labelset on the bound knowledge box -
  // Explore intersects them with the box's facet counts, so an id that is not a
  // real label silently yields an empty portal. Read from the box on
  // 2026-08-31; the comments are its resource counts.
  topics: [
    { id: 'research-development', label: 'Research and development' }, // 842
    { id: 'investment-strategy', label: 'Investment strategy' }, // 147
    { id: 'partnerships-initiatives', label: 'Partnerships and initiatives' }, // 45
    { id: 'sustainability', label: 'Sustainability' }, // 30
    { id: 'grdc-network', label: 'GRDC network' }, // 2
  ],
  suggestedQuestions: [
    {
      id: 'grdc-q1',
      text: 'What rotation strategies help manage herbicide-resistant ryegrass?',
    },
    { id: 'grdc-q2', text: 'How does nitrogen timing affect grain protein in dryland wheat?' },
    { id: 'grdc-q3', text: 'What is the current guidance on managing net blotch in barley?' },
    { id: 'grdc-q4', text: 'How is frost risk managed across the southern cropping region?' },
    { id: 'grdc-q5', text: 'What storage conditions reduce grain quality loss after harvest?' },
    { id: 'grdc-q6', text: 'Which practices improve water use efficiency in low rainfall zones?' },
  ],
  entityTypes: [
    { id: 'crop', label: 'Crop', colour: '#7cb342' },
    { id: 'pest', label: 'Pest or disease', colour: '#e53935' },
    { id: 'researcher', label: 'Researcher', colour: '#5e97f6' },
    { id: 'project', label: 'GRDC project', colour: '#007945' },
    { id: 'region', label: 'Growing region', colour: '#26a69a' },
  ],
  relationTypes: ['studies', 'affects', 'conducted-in', 'funded-by', 'collaborates-with'],
})

const frdc: TenantConfig = TenantConfigSchema.parse({
  slug: 'frdc',
  branding: {
    productName: 'FRDC Knowledge Hub',
    organisation: 'Fisheries Research and Development Corporation',
    tagline: 'Fisheries and aquaculture research and development',
    colours: {
      // Sampled from frdc.com.au: the navy carries the nav band and headings,
      // the teal is their call-to-action colour.
      primary: '#143669',
      accent: '#00b8a5',
      heroFrom: '#0b2247',
      heroTo: '#0e5f6b',
    },
    logoUrl: '/brand/frdc-logo.png',
    heroImageUrl: '/brand/hero/frdc-fuelheader.jpg',
    bannerImageUrl: '/brand/hero/frdc-frdcconnectbanner.jpg',
  },
  searchPlaceholder: 'Search fisheries, aquaculture, stock assessment, marine ecology…',
  // These ids must match the `topic` labelset actually on the bound knowledge
  // box - Explore intersects them with the box's classification facet counts,
  // so an id that is not a real label silently yields an empty portal.
  topics: [
    { id: 'research-development', label: 'Research and development' },
    { id: 'carp-control', label: 'Carp control' },
    { id: 'stakeholder-engagement', label: 'Stakeholder engagement' },
    { id: 'governance-reporting', label: 'Governance and reporting' },
    { id: 'standards', label: 'Standards' },
    { id: 'international-connections', label: 'International connections' },
  ],
  suggestedQuestions: [
    {
      id: 'frdc-q1',
      text: 'What stock assessment methods are recommended for data-limited fisheries?',
    },
    { id: 'frdc-q2', text: 'How is white spot disease being managed in prawn aquaculture?' },
    {
      id: 'frdc-q3',
      text: 'What post-harvest handling practices best preserve rock lobster quality?',
    },
    {
      id: 'frdc-q4',
      text: 'How are marine heatwaves affecting abalone populations along the southern coast?',
    },
    {
      id: 'frdc-q5',
      text: 'What biosecurity controls reduce pathogen spread between aquaculture leases?',
    },
    {
      id: 'frdc-q6',
      text: 'What does the latest research say about bycatch reduction in trawl fisheries?',
    },
  ],
  entityTypes: [
    { id: 'species', label: 'Species', colour: '#7cb342' },
    { id: 'researcher', label: 'Researcher', colour: '#5e97f6' },
    { id: 'project', label: 'FRDC project', colour: '#2c9c91' },
    { id: 'pathogen', label: 'Pathogen', colour: '#e53935' },
    { id: 'location', label: 'Location', colour: '#f6bf26' },
  ],
  relationTypes: ['studies', 'infects', 'located-in', 'funded-by', 'assesses'],
})

const tenantsBySlug: Record<string, TenantConfig> = {
  frdc,
  grdc,
}

export function tenantConfig(slug: string): TenantConfig | undefined {
  return tenantsBySlug[slug]
}

export function tenantSummaries(): TenantSummary[] {
  return Object.values(tenantsBySlug).map((tenant) => ({
    slug: tenant.slug,
    organisation: tenant.branding.organisation,
    productName: tenant.branding.productName,
    tagline: tenant.branding.tagline,
  }))
}

// ---------------------------------------------------------------------------
// Dynamic tenant store: the seed above plus knowledge box portals added in the
// app, persisted as JSON (TENANTS_PATH, default ./data/tenants.json).
// ---------------------------------------------------------------------------

/** Neutral dark palette for portals added in-app (until a theming pass). */
const DEFAULT_COLOURS = {
  primary: '#27364b',
  accent: '#5a8bd6',
  heroFrom: '#141d2b',
  heroTo: '#27364b',
}

export interface NewTenantInput {
  name: string
  organisation?: string
  tagline?: string
}

/** Config fields corpus analysis is allowed to rewrite. */
export interface TenantPatch {
  topics?: TenantConfig['topics']
  suggestedQuestions?: TenantConfig['suggestedQuestions']
  searchPlaceholder?: string
  branding?: TenantConfig['branding']
  /** Portal-managed behaviour settings (system prompt, image grounding). */
  prompts?: { ask?: string; images?: boolean }
}

export class TenantStore {
  private custom: Record<string, TenantConfig> = {}
  /** Analysis-derived overrides, applicable to seeded portals too. */
  private overrides: Record<string, TenantPatch> = {}
  private disabled = new Set<string>()
  private readonly path: string

  constructor(env: Record<string, string | undefined> = process.env) {
    this.path = env.TENANTS_PATH ?? './data/tenants.json'
    const raw = readJsonSafe<Record<string, unknown>>(this.path, {})
    // v2 format: { custom, overrides, disabled }. v1 was a bare custom map.
    const customSource = (raw.custom ?? raw) as Record<string, unknown>
    for (const [slug, value] of Object.entries(customSource)) {
      const parsed = TenantConfigSchema.safeParse(value)
      if (parsed.success) this.custom[slug] = parsed.data
    }
    if (raw.overrides && typeof raw.overrides === 'object') {
      this.overrides = raw.overrides as Record<string, TenantPatch>
    }
    if (Array.isArray(raw.disabled)) {
      this.disabled = new Set(raw.disabled.filter((s): s is string => typeof s === 'string'))
    }
  }

  get(slug: string): TenantConfig | undefined {
    const base = tenantsBySlug[slug] ?? this.custom[slug]
    if (!base) return undefined
    const override = this.overrides[slug]
    if (!override) return base
    const { prompts: _prompts, ...configPatch } = override
    return { ...base, ...configPatch }
  }

  /** App-side settings that never reach the public config payload. */
  promptsFor(slug: string): { ask?: string; images?: boolean } {
    return this.overrides[slug]?.prompts ?? {}
  }

  isCustom(slug: string): boolean {
    return slug in this.custom && !(slug in tenantsBySlug)
  }

  isDisabled(slug: string): boolean {
    return this.disabled.has(slug)
  }

  setDisabled(slug: string, disabled: boolean): void {
    if (disabled) this.disabled.add(slug)
    else this.disabled.delete(slug)
    this.persist()
  }

  /** Rename or re-theme a portal (product name, organisation, tagline, palette, type, shape). */
  patchBranding(
    slug: string,
    branding: {
      productName?: string
      organisation?: string
      tagline?: string
      colours?: TenantConfig['branding']['colours']
      typography?: TenantConfig['branding']['typography']
      shape?: TenantConfig['branding']['shape']
      textScale?: TenantConfig['branding']['textScale']
      density?: TenantConfig['branding']['density']
      paletteId?: TenantConfig['branding']['paletteId']
    },
  ): void {
    const base = this.get(slug)
    if (!base) return
    const merged = {
      ...base.branding,
      ...(branding.productName ? { productName: branding.productName } : {}),
      ...(branding.organisation ? { organisation: branding.organisation } : {}),
      ...(branding.tagline ? { tagline: branding.tagline } : {}),
      ...(branding.colours ? { colours: branding.colours } : {}),
      ...(branding.typography ? { typography: branding.typography } : {}),
      ...(branding.shape ? { shape: branding.shape } : {}),
      ...(branding.textScale ? { textScale: branding.textScale } : {}),
      ...(branding.density ? { density: branding.density } : {}),
      ...(branding.paletteId ? { paletteId: branding.paletteId } : {}),
    }
    if (this.custom[slug]) {
      this.custom[slug] = { ...this.custom[slug], branding: merged }
    } else {
      this.overrides[slug] = { ...this.overrides[slug], branding: merged }
    }
    this.persist()
  }

  /** Apply analysis-derived config (topics, questions, placeholder). */
  patch(slug: string, patch: TenantPatch): void {
    this.overrides[slug] = { ...this.overrides[slug], ...patch }
    this.persist()
  }

  list(includeDisabled = false): TenantSummary[] {
    const all = [
      ...tenantSummaries(),
      ...Object.values(this.custom).map((tenant) => ({
        slug: tenant.slug,
        organisation: tenant.branding.organisation,
        productName: tenant.branding.productName,
        tagline: tenant.branding.tagline,
      })),
    ]
    return includeDisabled ? all : all.filter((t) => !this.disabled.has(t.slug))
  }

  add(input: NewTenantInput): TenantConfig {
    const base = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!base) throw new Error('The portal name must contain letters or numbers')
    let slug = base
    for (let i = 2; this.get(slug); i++) slug = `${base}-${i}`
    const config = TenantConfigSchema.parse({
      slug,
      branding: {
        productName: input.name,
        organisation: input.organisation?.trim() || input.name,
        tagline: input.tagline?.trim() || 'Research, discovery and development',
        colours: DEFAULT_COLOURS,
      },
      searchPlaceholder: 'Search this portal…',
      topics: [],
      suggestedQuestions: [],
      entityTypes: [],
      relationTypes: [],
    })
    this.custom[slug] = config
    this.persist()
    return config
  }

  remove(slug: string): boolean {
    if (!this.isCustom(slug)) return false
    delete this.custom[slug]
    delete this.overrides[slug]
    this.disabled.delete(slug)
    this.persist()
    return true
  }

  private persist(): void {
    writeJsonAtomic(this.path, {
      custom: this.custom,
      overrides: this.overrides,
      disabled: [...this.disabled],
    })
  }
}
