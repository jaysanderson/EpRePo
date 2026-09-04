import process from 'node:process'
import { type TenantConfig, TenantConfigSchema, type TenantSummary } from '@research-portal/core'
import { readJsonSafe, writeJsonAtomic } from './persist.ts'
import { RESULTS_QUESTION_RULE } from './intent-router.ts'

// ---------------------------------------------------------------------------
// Seed tenant configs - the single source of truth for tenant-driven theming
// and copy, validated at module load so a bad seed fails fast on boot.
// Persistence is deliberately plain JSON files on the volume (project rule:
// no SQLite or embedded databases unless absolutely unavoidable).
// ---------------------------------------------------------------------------

const PLATFORM_HOSTNAMES: Readonly<Record<string, string>> = {
  frdc: 'frdc.corpuskit.org',
  grdc: 'grdc.corpuskit.org',
  opax: 'opax.corpuskit.org',
}

/**
 * Compatibility for portals whose custom domains pre-date persisted hostname
 * metadata. OPAX was created at runtime, so its stored config needs the same
 * read-time upgrade as the two seeded portals.
 */
export function withPlatformHostname(config: TenantConfig): TenantConfig {
  const hostname = config.hostname ?? PLATFORM_HOSTNAMES[config.slug]
  return hostname ? { ...config, hostname } : config
}

export function tenantSummary(config: TenantConfig): TenantSummary {
  return {
    slug: config.slug,
    organisation: config.branding.organisation,
    productName: config.branding.productName,
    tagline: config.branding.tagline,
    ...(config.hostname ? { hostname: config.hostname } : {}),
  }
}

const grdc: TenantConfig = TenantConfigSchema.parse({
  slug: 'grdc',
  hostname: PLATFORM_HOSTNAMES.grdc,
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
  assessmentHeading: 'Industry Knowledge Areas',
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
  hostname: PLATFORM_HOSTNAMES.frdc,
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
  assessmentHeading: 'Industry Knowledge Areas',
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

const eprepo: TenantConfig = TenantConfigSchema.parse({
  slug: 'eprepo',
  branding: {
    productName: 'EpRePo Research Portal',
    organisation: 'EpRePo - Epilepsy Research Repository',
    tagline: 'Open-access epilepsy research from Melbourne clinical neuroscience',
    colours: {
      // Deep violet carries the identity (lavender is the international
      // epilepsy awareness colour); the lighter violet is the call to action.
      primary: '#2e2359',
      accent: '#8b6fd8',
      heroFrom: '#1f1740',
      heroTo: '#4a3a8f',
    },
    logoUrl: '/brand/eprepo-logo.svg',
  },
  searchPlaceholder: 'Search seizure forecasting, genetics, antiseizure medications, surgery…',
  assessmentHeading: 'Research knowledge areas',
  // A global research initiative: the corpus is not organised by Australian
  // state, so Explore omits the regional discovery band.
  regionalDiscovery: false,
  // Supplements and videos stay browsable in the library, but search and ask
  // are grounded in the articles themselves.
  searchExclude: [
    { labelset: 'format', label: 'supplement' },
    { labelset: 'format', label: 'media' },
  ],
  // One ask box, six jobs-to-be-done, each on its own stored search
  // configuration (docs/INTENT-ROUTING.md). Order matters: stage-1 rules are
  // tried in this order and the first match wins.
  defaultIntent: 'general',
  entityTerms: [
    'fenfluramine',
    'stiripentol',
    'cannabidiol',
    'clobazam',
    'valproate',
    'sodium valproate',
    'lamotrigine',
    'levetiracetam',
    'carbamazepine',
    'oxcarbazepine',
    'phenytoin',
    'vigabatrin',
    'topiramate',
    'lacosamide',
    'cenobamate',
    'perampanel',
    'brivaracetam',
    'zonisamide',
    'ethosuximide',
    'phenobarbital',
    'rufinamide',
    'everolimus',
    'ganaxolone',
    'diazepam',
    'midazolam',
    'ketogenic diet',
    'Dravet',
    'Lennox-Gastaut',
  ],
  intents: [
    {
      id: 'lookup',
      label: 'Exact lookup',
      description: 'An identifier or a bare term: the reader wants the documents, not an essay.',
      examples: ['SCN8A', 'PMC8371239', 'cenobamate', 'Dravet'],
      retrieval: {
        features: ['keyword'],
        topK: 30,
        reranker: 'noop',
        exclude: [
          { labelset: 'format', label: 'supplement' },
          { labelset: 'format', label: 'media' },
        ],
      },
      answer: { surfaces: ['search'], strategy: 'none', promptVariant: 'default' },
      // One or two bare tokens, and only when one of them is a recognised
      // entity (a gene-symbol shape or a lexicon term): "SCN8A", "cenobamate",
      // "Dravet syndrome". Two arbitrary words ("Okafor recurrence") and
      // hyphenated compounds ("EEG-fMRI") are questions for retrieval, not a
      // listing. Identifiers (DOI, PMCID, PMID) are handled by the router
      // itself, before any rule. The classifier can never pick this intent.
      rules: ['^\\s*\\S+(?:\\s+\\S+)?\\s*$'],
      requireEntity: true,
      rulesOnly: true,
    },
    {
      id: 'data',
      label: 'Supplementary data',
      description:
        'Only for a question that explicitly asks for a supplementary table, data sheet, ' +
        'appendix, protocol document, peer review history or raw data. Never for a result, ' +
        'a rate or a trial design that the paper itself reports.',
      examples: [
        'Sample size calculation in the SERIAS protocol',
        'Supplementary table of variants in the exome study',
        'What did the peer reviewers say about the BREATHS protocol?',
      ],
      // The papers and their attachments together, with a second retrieval
      // pass over the attachments alone: a data question reads the paper's
      // own results beside its tables, never the tables alone (a supplement
      // never states what the trial was).
      retrieval: {
        features: ['keyword', 'semantic'],
        topK: 20,
        reranker: 'predict',
        exclude: [{ labelset: 'format', label: 'media' }],
        prefer: [{ labelset: 'format', label: 'supplement' }],
      },
      answer: {
        surfaces: ['ask', 'search'],
        strategy: 'neighbours',
        neighbours: 4,
        promptVariant: 'data',
      },
      // The word must name an attachment: "protocol" alone is a methods
      // question, "the BREATHS trial protocol" is a document. A sample size
      // is a figure the paper reports, so it is a results question below.
      rules: [
        '\\b(supplement|supplementary|data ?sheet|table s\\d|appendix|appendices|' +
        '(?:study|trial|research) protocol|protocol (?:paper|document|publication)|' +
        'peer[- ]review\\w*|raw data|datasets?)\\b',
      ],
      ruleRationale: 'the question names a table, a protocol document or a peer review file',
      classifierGate: [
        '\\b(tables?|supplement\\w*|data ?sheets?|appendi(?:x|ces)|protocol\\w*|' +
        'peer[- ]review\\w*|raw data|datasets?)\\b',
      ],
    },
    {
      id: 'latest',
      label: 'Latest evidence',
      description: 'What is newest on a topic, newest first with the year stated.',
      examples: ['Latest on responsive neurostimulation', 'Any 2026 papers on cannabidiol?'],
      retrieval: {
        features: ['keyword', 'semantic'],
        topK: 20,
        reranker: 'predict',
        exclude: [
          { labelset: 'format', label: 'supplement' },
          { labelset: 'format', label: 'media' },
        ],
      },
      answer: {
        surfaces: ['ask'],
        strategy: 'neighbours',
        neighbours: 2,
        promptVariant: 'recency',
        prequeries: ['{query} published 2025 or 2026'],
        sortByPublished: true,
      },
      // A recency word is required: a bare year ("Seery 2025 rituximab") is an
      // author-year lookup, not a request for what is newest.
      rules: [
        '\\b(latest|newest|most recent|recent|recently|this year|since 20\\d\\d|(?:in|from|published in) 202[5-9]|202[5-9] (?:papers?|studies|publications|trials?))\\b',
      ],
    },
    {
      id: 'clinical',
      label: 'Clinical decision',
      description:
        'Choosing, avoiding or dosing a treatment for a patient: contraindications and monitoring are checked every time.',
      examples: [
        'Which ASMs should be avoided in SCN1A Dravet?',
        'Fenfluramine dose with stiripentol?',
      ],
      retrieval: {
        features: ['keyword', 'semantic'],
        topK: 12,
        reranker: 'predict',
        exclude: [
          { labelset: 'format', label: 'supplement' },
          { labelset: 'format', label: 'media' },
          { labelset: 'kind', label: 'case-study' },
        ],
      },
      answer: {
        surfaces: ['ask'],
        strategy: 'neighbours',
        neighbours: 3,
        graph: true,
        promptVariant: 'safety',
        prequeries: [
          'contraindications, drugs to avoid and safety monitoring for {entities}',
          'dose limits, starting dose and interactions for {entities}',
        ],
        minScore: 0.6,
      },
      rules: [
        '\\b(dose|dosing|dosage|start(ing)?|titrat|avoid|contraindicat|safe|safety|should i|which asm|first[- ]line|add[- ]on|switch|interaction|pregnan|monitor)',
      ],
      // A medication or syndrome from the lexicon must be named: "dose" in a
      // rodent selenate protocol is a methods question, not a prescribing one.
      requireEntity: true,
      requireLexiconEntity: true,
    },
    {
      id: 'review',
      label: 'Evidence review',
      description: 'Synthesis across the corpus, grounded on full text.',
      examples: [
        'What is known about multiday seizure cycles?',
        'Compare SCN1A, SCN2A and SCN8A gain versus loss of function',
      ],
      retrieval: {
        features: ['keyword', 'semantic'],
        topK: 12,
        reranker: 'predict',
        exclude: [
          { labelset: 'format', label: 'supplement' },
          { labelset: 'format', label: 'media' },
        ],
      },
      answer: { surfaces: ['ask'], strategy: 'full', promptVariant: 'synthesis', depth: 'deep' },
      // Length is not a rule: a 26-word fitness-to-drive lookup is not a
      // review, and the classifier reads the question instead.
      rules: [
        '\\b(compare|comparison|versus|\\bvs\\b|synthesis|what is known|evidence for|overview|across studies|mechanism)\\b',
        // A survey of what a group or a field has published is a review,
        // not a lookup of one figure.
        '\\b(what (?:has|have) .{0,80}published|published on|literature on|body of work|state of the (?:art|evidence))\\b',
      ],
    },
    {
      id: 'general',
      label: 'General',
      description: 'Everything else, on the default configuration.',
      examples: ['How does the ketogenic diet work?'],
      retrieval: {
        features: ['keyword', 'semantic'],
        topK: 20,
        reranker: 'predict',
        exclude: [
          { labelset: 'format', label: 'supplement' },
          { labelset: 'format', label: 'media' },
        ],
      },
      answer: {
        surfaces: ['ask', 'search'],
        strategy: 'neighbours',
        neighbours: 2,
        graph: true,
        promptVariant: 'default',
      },
      // A question for a figure the paper reports (a rate, a count, an
      // outcome, a sample size) reads the papers by rule: the classifier
      // used to send every such question to the supplements, and the
      // rule answers in microseconds.
      rules: [RESULTS_QUESTION_RULE],
      ruleRationale: 'a results question, answered from the papers themselves',
    },
  ],
  // These ids are the `topic` labelset `deno task provision -- eprepo` pushes
  // to the bound knowledge box. Explore intersects them with the box's facet
  // counts, so keep this list and the labelset in step; corpus analysis in
  // Manage may rewrite them once the corpus is loaded.
  topics: [
    { id: 'seizure-forecasting-cycles', label: 'Seizure forecasting and cycles' },
    { id: 'genetics-genomics', label: 'Genetics and genomics' },
    { id: 'antiseizure-medications', label: 'Antiseizure medications' },
    { id: 'pregnancy-teratogenicity', label: 'Pregnancy and teratogenicity' },
    { id: 'epilepsy-surgery-imaging', label: 'Epilepsy surgery and imaging' },
    { id: 'eeg-neurophysiology', label: 'EEG and neurophysiology' },
    { id: 'autoimmune-encephalitis', label: 'Autoimmune encephalitis' },
    { id: 'devices-neurostimulation', label: 'Devices and neurostimulation' },
    { id: 'psychiatry-functional-seizures', label: 'Psychiatry and functional seizures' },
    { id: 'epidemiology-outcomes', label: 'Epidemiology and outcomes' },
  ],
  suggestedQuestions: [
    {
      id: 'eprepo-q1',
      text: 'What are the common clinical misconceptions about multiday seizure cycles?',
    },
    {
      id: 'eprepo-q2',
      text:
        'Which antiseizure medications carry the highest risk of major congenital malformations?',
    },
    {
      id: 'eprepo-q3',
      text: 'How effective is adjunctive cannabidiol for drug-resistant focal epilepsy?',
    },
    {
      id: 'eprepo-q4',
      text: 'When is stereo-EEG indicated in presurgical evaluation of focal epilepsy?',
    },
    {
      id: 'eprepo-q5',
      text: 'What predicts quality of life and depression after a first seizure?',
    },
    {
      id: 'eprepo-q6',
      text: 'Which genes are implicated in developmental and epileptic encephalopathies?',
    },
  ],
  entityTypes: [
    { id: 'condition', label: 'Condition or syndrome', colour: '#e5533d' },
    { id: 'gene', label: 'Gene or variant', colour: '#f2a93b' },
    { id: 'medication', label: 'Medication or treatment', colour: '#3fa66b' },
    { id: 'researcher', label: 'Researcher', colour: '#5e97f6' },
    { id: 'institution', label: 'Institution', colour: '#8b6fd8' },
    { id: 'method', label: 'Method or device', colour: '#26a69a' },
  ],
  relationTypes: [
    'studies',
    'treats',
    'associated-with',
    'causes',
    'conducted-at',
    'collaborates-with',
  ],
})

const tenantsBySlug: Record<string, TenantConfig> = {
  eprepo,
  frdc,
  grdc,
}

export function tenantConfig(slug: string): TenantConfig | undefined {
  const config = tenantsBySlug[slug]
  return config ? withPlatformHostname(config) : undefined
}

export function tenantSummaries(): TenantSummary[] {
  return Object.values(tenantsBySlug).map((tenant) => tenantSummary(withPlatformHostname(tenant)))
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
  hostname?: TenantConfig['hostname']
  topics?: TenantConfig['topics']
  suggestedQuestions?: TenantConfig['suggestedQuestions']
  searchPlaceholder?: string
  assessmentHeading?: string
  branding?: TenantConfig['branding']
  /** Portal-managed behaviour settings (system prompt, image grounding). */
  prompts?: { ask?: string; images?: boolean }
  /** Extraction routing rules (docs/EXTRACTION-LAB.md). */
  extraction?: TenantConfig['extraction']
  /** Intent-routed configurations (docs/INTENT-ROUTING.md), when a portal tunes its own. */
  intents?: TenantConfig['intents']
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
    if (!override) return withPlatformHostname(base)
    const { prompts: _prompts, ...configPatch } = override
    return withPlatformHostname({ ...base, ...configPatch })
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
      ...Object.values(this.custom).map((tenant) =>
        tenantSummary(this.get(tenant.slug) ?? withPlatformHostname(tenant))
      ),
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
    const configured = withPlatformHostname(config)
    this.custom[slug] = configured
    this.persist()
    return configured
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

/** Public tenant-store contract for runtimes without a local filesystem. */
export type TenantStoreApi = Pick<TenantStore, keyof TenantStore>
