import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import {
  AdminTenantOverviewSchema,
  type AskEvent,
  AskEventSchema,
  type CatalogPage,
  DEFAULT_RESEARCH_ENRICHMENT,
  type Enrichment,
  type FacetCounts,
  FacetCountsSchema,
  type Labelset,
  type Question,
  type ResourceSummary,
  type SearchResults,
  SearchResultsSchema,
  type TenantConfig,
  TenantConfigSchema,
} from '@research-portal/core'
import { AragApiError, type AragProvider, type RetrievalProvider } from '@research-portal/retrieval'
import { buildApp } from './app.ts'
import { TenantStore } from './tenants.ts'
import { EnrichmentStore } from './enrichments.ts'
import type { PortalDomainProvisioner } from './cloudflare-domains.ts'

// Hermetic tenant store - tests must never read the repo's live data/tenants.json.
const freshTenants = () =>
  new TenantStore({ TENANTS_PATH: `${Deno.makeTempDirSync()}/tenants.json` })
import { BindingStore } from './bindings.ts'

// ---------------------------------------------------------------------------
// StubProvider - a deterministic, in-memory RetrievalProvider double used only
// in tests. It never ships in product code; the API server always gets a real
// provider (currently `createProviderFromEnv`) injected via `buildApp`.
// ---------------------------------------------------------------------------

const resourceOne: ResourceSummary = {
  id: 'res-1',
  title: 'Abalone stock health in southern waters',
  summary: 'An overview of abalone population trends and stressors.',
  type: 'pdf',
  topicIds: ['stock-assessment'],
  keyFacts: ['Populations have declined 12% since 2019.'],
  published: '2023-06-01',
}

const resourceTwo: ResourceSummary = {
  id: 'res-2',
  title: 'Marine heatwave impacts on rock lobster',
  summary: 'Field study of thermal stress on rock lobster fisheries.',
  type: 'web',
  topicIds: ['marine-sustainability'],
  keyFacts: ['Heatwave events correlate with reduced catch rates.'],
}

class StubProvider implements RetrievalProvider {
  private resources: ResourceSummary[] = [resourceOne, resourceTwo]

  async listResources(_tenant: TenantConfig): Promise<ResourceSummary[]> {
    return this.resources
  }

  async resource(_tenant: TenantConfig, id: string): Promise<ResourceSummary | null> {
    return this.resources.find((resource) => resource.id === id) ?? null
  }

  async search(_tenant: TenantConfig, query: string): Promise<SearchResults> {
    return {
      query,
      resources: this.resources.map((resource, index) => ({
        ...resource,
        relevance: index === 0 ? 0.9 : 0.6,
        citedCount: 0,
      })),
      relatedQuestions: [{ id: 'rq-1', text: 'What else affects this species?' }],
    }
  }

  async catalog(_tenant: TenantConfig): Promise<CatalogPage> {
    return {
      items: this.resources.map((r) => ({
        id: r.id,
        title: r.title,
        status: 'processed' as const,
        topicIds: r.topicIds,
      })),
      total: this.resources.length,
    }
  }

  async facets(_tenant: TenantConfig, labelsets: string[]): Promise<FacetCounts> {
    const first = labelsets[0]
    return first ? { [first]: { 'stock-assessment': 1 } } : {}
  }

  async topicResources(_tenant: TenantConfig, topicId: string): Promise<ResourceSummary[]> {
    return this.resources.filter((resource) => resource.topicIds.includes(topicId))
  }

  async labelsets(_tenant: TenantConfig): Promise<Labelset[]> {
    return [{ id: 'topic', title: 'Topic', multiple: false, labels: ['stock-assessment'] }]
  }

  async suggest(_tenant: TenantConfig): Promise<Question[]> {
    return [{ id: 'sq-1', text: 'What is known about abalone stock health?' }]
  }

  async *ask(_tenant: TenantConfig, query: string): AsyncIterable<AskEvent> {
    yield { type: 'stage', stage: 'preprocessing', status: 'started' }
    yield { type: 'stage', stage: 'preprocessing', status: 'completed' }
    yield {
      type: 'sources',
      resources: [{ ...resourceOne, relevance: 0.9, citedCount: 1 }],
    }
    yield { type: 'delta', text: `Here is what we know about ${query}.` }
    yield {
      type: 'citation',
      citation: { index: 1, resourceId: resourceOne.id, title: resourceOne.title },
    }
    yield { type: 'done' }
  }
}

function makeApp(enrichments?: EnrichmentStore) {
  return buildApp({ provider: new StubProvider(), tenants: freshTenants(), enrichments })
}

describe('GET /api/tenants', () => {
  it('returns the seeded tenants', async () => {
    const app = makeApp()
    const response = await app.request('/api/tenants')

    expect(response.status).toBe(200)
    const body = await response.json() as Array<{ slug: string }>
    const slugs = body.map((tenant) => tenant.slug)
    expect(slugs).toContain('frdc')
    expect(slugs).toContain('grdc')
  })
})

describe('GET /api/t/:slug/config', () => {
  it('parses with TenantConfigSchema for a known tenant', async () => {
    const app = makeApp()
    const response = await app.request('/api/t/frdc/config')

    expect(response.status).toBe(200)
    TenantConfigSchema.parse(await response.json())
  })

  it('returns 404 for an unknown tenant', async () => {
    const app = makeApp()
    const response = await app.request('/api/t/nope/config')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'unknown_tenant' })
  })
})

describe('portal domain lifecycle', () => {
  const passcode = 'test-passcode'
  const adminHeaders = {
    'x-admin-passcode': passcode,
    'content-type': 'application/json',
  }
  const add = (app: ReturnType<typeof buildApp>, name: string) =>
    app.request('/api/admin/tenants', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name }),
    })

  it('persists a hostname only after successful provisioning and removes it with the portal', async () => {
    const tenants = freshTenants()
    const attached: string[] = []
    const detached: string[] = []
    const domains: PortalDomainProvisioner = {
      attach(hostname) {
        attached.push(hostname)
        return Promise.resolve({ hostname, created: true })
      },
      detach(hostname) {
        detached.push(hostname)
        return Promise.resolve({ hostname, removed: true })
      },
    }
    const app = buildApp({
      provider: new StubProvider(),
      tenants,
      adminPasscode: passcode,
      domainProvisioner: domains,
    })

    const created = await add(app, 'New research portal')
    expect(created.status).toBe(200)
    expect(await created.json()).toEqual({
      ok: true,
      slug: 'new-research-portal',
      domain: {
        status: 'active',
        hostname: 'new-research-portal.corpuskit.org',
        created: true,
      },
    })
    expect(attached).toEqual(['new-research-portal.corpuskit.org'])
    expect(tenants.get('new-research-portal')?.hostname).toBe(
      'new-research-portal.corpuskit.org',
    )
    expect(tenants.list().find((tenant) => tenant.slug === 'new-research-portal')?.hostname).toBe(
      'new-research-portal.corpuskit.org',
    )

    const removed = await app.request('/api/admin/tenants/new-research-portal', {
      method: 'DELETE',
      headers: { 'x-admin-passcode': passcode },
    })
    expect(removed.status).toBe(200)
    expect(detached).toEqual(['new-research-portal.corpuskit.org'])
    expect(tenants.get('new-research-portal')).toBeUndefined()
  })

  it('creates a usable relative-route portal when credentials are absent or provisioning fails', async () => {
    const withoutCredentials = freshTenants()
    const unconfigured = buildApp({
      provider: new StubProvider(),
      tenants: withoutCredentials,
      adminPasscode: passcode,
      domainProvisioner: null,
    })
    const skipped = await add(unconfigured, 'Relative only')
    expect(await skipped.json()).toMatchObject({
      ok: true,
      slug: 'relative-only',
      domain: { status: 'skipped', reason: 'not_configured' },
    })
    expect(withoutCredentials.get('relative-only')?.hostname).toBeUndefined()

    const failedStore = freshTenants()
    const failed = buildApp({
      provider: new StubProvider(),
      tenants: failedStore,
      adminPasscode: passcode,
      domainProvisioner: {
        attach: () => Promise.reject(new Error('Cloudflare is unavailable')),
        detach: () => Promise.resolve({ hostname: '', removed: false }),
      },
    })
    const response = await add(failed, 'Still usable')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      slug: 'still-usable',
      domain: { status: 'failed', message: 'Cloudflare is unavailable' },
    })
    expect(failedStore.get('still-usable')).toBeDefined()
    expect(failedStore.get('still-usable')?.hostname).toBeUndefined()
  })

  it('skips unsafe hostnames without failing the portal', async () => {
    const tenants = freshTenants()
    let called = false
    const app = buildApp({
      provider: new StubProvider(),
      tenants,
      adminPasscode: passcode,
      domainProvisioner: {
        attach: () => {
          called = true
          return Promise.resolve({ hostname: '', created: false })
        },
        detach: () => Promise.resolve({ hostname: '', removed: false }),
      },
    })

    const response = await add(app, 'API')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      slug: 'api',
      domain: { status: 'skipped', reason: 'unsafe_slug' },
    })
    expect(called).toBe(false)
    expect(tenants.get('api')).toBeDefined()
  })

  it('keeps the tenant when its attached domain cannot be removed', async () => {
    const tenants = freshTenants()
    tenants.add({ name: 'Removal retry' })
    tenants.patch('removal-retry', { hostname: 'removal-retry.corpuskit.org' })
    const app = buildApp({
      provider: new StubProvider(),
      tenants,
      adminPasscode: passcode,
      domainProvisioner: {
        attach: (hostname) => Promise.resolve({ hostname, created: false }),
        detach: () => Promise.reject(new Error('Cloudflare is unavailable')),
      },
    })

    const response = await app.request('/api/admin/tenants/removal-retry', {
      method: 'DELETE',
      headers: { 'x-admin-passcode': passcode },
    })
    expect(response.status).toBe(502)
    expect(tenants.get('removal-retry')).toBeDefined()
  })

  it('upgrades the existing OPAX runtime config to its configured hostname', () => {
    const tenants = freshTenants()
    expect(tenants.add({ name: 'OPAX' }).hostname).toBe('opax.corpuskit.org')
    expect(tenants.list().find((tenant) => tenant.slug === 'opax')?.hostname).toBe(
      'opax.corpuskit.org',
    )
  })
})

describe('tenant slug aliases', () => {
  it('permanently redirects the retired tenant root and preserves its query string', async () => {
    const app = makeApp()
    const response = await app.request('/t/gdrc?from=bookmark')

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('/t/grdc?from=bookmark')
  })

  it('preserves the path and query string for nested bookmarks', async () => {
    const app = makeApp()
    const response = await app.request('/t/gdrc/library/report-42?topics=soil&sort=recent')

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(
      '/t/grdc/library/report-42?topics=soil&sort=recent',
    )
  })

  it('keeps serving the old slug until its live tenant has been retired', async () => {
    const tenants = freshTenants()
    const existing = tenants.add({ name: 'GDRC' })
    expect(existing.slug).toBe('gdrc')
    const app = buildApp({ provider: new StubProvider(), tenants })

    const response = await app.request('/t/gdrc/library?topics=soil')

    expect(response.status).toBe(404)
    expect(response.headers.get('location')).toBeNull()
  })
})

describe('GET /api/t/:slug/resources/:id/thumbnail', () => {
  it('keeps stable thumbnails warm and forwards validators from the platform', async () => {
    const management = {
      thumbnailResponse: () =>
        Promise.resolve(
          new Response(new Uint8Array([1, 2, 3]), {
            headers: {
              'content-type': 'image/webp',
              'content-length': '3',
              etag: '"thumb-v1"',
              'last-modified': 'Mon, 31 Aug 2026 00:00:00 GMT',
            },
          }),
        ),
    } as unknown as AragProvider
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      management,
    })

    const response = await app.request('/api/t/frdc/resources/res-1/thumbnail')

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800',
    )
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('content-length')).toBe('3')
    expect(response.headers.get('etag')).toBe('"thumb-v1"')
    expect(response.headers.get('last-modified')).toBe('Mon, 31 Aug 2026 00:00:00 GMT')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })
})

describe('tenant route aliases', () => {
  it('permanently redirects Assistant bookmarks to Ask and preserves the query string', async () => {
    const app = makeApp()
    const response = await app.request('/t/frdc/assistant?ask=abalone%20recovery')

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('/t/frdc/ask?ask=abalone%20recovery')
  })

  it('preserves sub-paths when redirecting renamed routes', async () => {
    const app = makeApp()
    const response = await app.request('/t/frdc/assistant/sessions/report-42?view=evidence')

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(
      '/t/frdc/ask/sessions/report-42?view=evidence',
    )
  })

  it('applies tenant and route aliases in one redirect', async () => {
    const app = makeApp()
    const response = await app.request('/t/gdrc/assistant?ask=soil')

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('/t/grdc/ask?ask=soil')
  })
})

describe('GET /api/t/:slug/search', () => {
  it('returns a SearchResultsSchema-valid payload', async () => {
    const app = makeApp()
    const response = await app.request('/api/t/frdc/search?q=abalone')

    expect(response.status).toBe(200)
    SearchResultsSchema.parse(await response.json())
  })

  it('returns 400 when q is missing', async () => {
    const app = makeApp()
    const response = await app.request('/api/t/frdc/search')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'missing_query' })
  })
})

describe('GET /api/t/:slug/search - catalogue lookups', () => {
  const article: ResourceSummary = {
    ...resourceOne,
    id: 'art-1',
    title: 'ENVISION natural history of Dravet syndrome',
    doi: '10.1111/epi.70015',
    pmcid: 'PMC8371239',
    pmid: '39876543',
    authors: ['Vajda FJE', 'Perucca P'],
    year: '2025',
  }
  const supplement: ResourceSummary = {
    ...resourceTwo,
    id: 'supp-1',
    title: 'Supplementary material 1: ENVISION tables',
    originUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8371239/',
  }
  class LookupProvider extends StubProvider {
    override async listResources(): Promise<ResourceSummary[]> {
      return [supplement, article, resourceTwo]
    }
  }
  const app = () => buildApp({ provider: new LookupProvider(), tenants: freshTenants() })

  it('resolves a DOI to exactly the resource that carries it, before any retrieval', async () => {
    const response = await app().request('/api/t/frdc/search?q=doi:10.1111/EPI.70015')
    const body = SearchResultsSchema.parse(await response.json())
    expect(body.lookup).toEqual({ kind: 'doi', value: '10.1111/EPI.70015', matched: true })
    expect(body.resources.map((r) => r.id)).toEqual(['art-1'])
    expect(body.resources[0]?.matchedField).toBe('metadata')
    expect(body.resources[0]?.matchedPassage).toBe('DOI 10.1111/epi.70015')
  })

  it('resolves a PMC id from the pmcid field or the origin URL, article first', async () => {
    const response = await app().request('/api/t/frdc/search?q=PMC8371239')
    const body = SearchResultsSchema.parse(await response.json())
    expect(body.resources.map((r) => r.id)).toEqual(['art-1', 'supp-1'])
  })

  it('is honest about an identifier nobody carries: no look-alike results', async () => {
    const response = await app().request('/api/t/frdc/search?q=10.1111/epi.17708')
    const body = SearchResultsSchema.parse(await response.json())
    expect(body.resources).toEqual([])
    expect(body.lookup).toEqual({ kind: 'doi', value: '10.1111/epi.17708', matched: false })
  })

  it('finds papers by author surname ahead of the retrieval results', async () => {
    const response = await app().request('/api/t/frdc/search?q=vajda')
    const body = SearchResultsSchema.parse(await response.json())
    expect(body.lookup).toEqual({ kind: 'author', value: 'vajda', matched: true })
    expect(body.resources[0]?.id).toBe('art-1')
    expect(body.resources[0]?.matchedPassage).toContain('Vajda FJE')
    // The stub's own results still follow, without duplicating the author hit.
    expect(body.resources.filter((r) => r.id === 'art-1')).toHaveLength(1)
  })
})

describe('GET /api/t/:slug/suggest', () => {
  it('ranks the configured questions by the typed query', async () => {
    const tenants = freshTenants()
    tenants.patch('frdc', {
      suggestedQuestions: [
        { id: 'a', text: 'How is white spot disease managed in prawns?' },
        { id: 'b', text: 'What is known about abalone stock health?' },
      ],
    })
    class SuggestProvider extends StubProvider {
      override async suggest(tenant: TenantConfig, query?: string): Promise<Question[]> {
        const { rankSuggestedQuestions } = await import(
          '../../../packages/retrieval/src/providers/arag/suggest-ranking.ts'
        )
        return rankSuggestedQuestions(tenant.suggestedQuestions, query)
      }
    }
    const app = buildApp({ provider: new SuggestProvider(), tenants })
    const ranked = await (await app.request('/api/t/frdc/suggest?q=abalone')).json() as Question[]
    expect(ranked[0]?.id).toBe('b')
    const plain = await (await app.request('/api/t/frdc/suggest')).json() as Question[]
    expect(plain[0]?.id).toBe('a')
  })
})

describe('GET /api/t/:slug/entity', () => {
  const management = (edges: { source: string; target: string; label: string }[]) =>
    ({
      relationsGraph: (_tenant: TenantConfig, opts?: { entity?: string }) =>
        Promise.resolve({
          nodes: opts?.entity
            ? [{ id: opts.entity, group: 'Gene', weight: edges.length }, {
              id: 'Dravet syndrome',
              group: 'Medical Condition',
              weight: 1,
            }]
            : [],
          edges,
        }),
    }) as unknown as AragProvider

  it('scopes relations to the entity and returns them with the resources', async () => {
    const edges = [{ source: 'SCN1A', target: 'Dravet syndrome', label: 'is a cause of' }]
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      management: management(edges),
    })
    const response = await app.request('/api/t/frdc/entity?name=SCN1A')
    expect(response.status).toBe(200)
    const body = await response.json() as { relations: { edges: unknown[] }; resources: unknown[] }
    expect(body.relations.edges).toEqual(edges)
    expect(body.resources.length).toBeGreaterThan(0)
  })

  it('returns 404 unknown_entity when nothing is known about the name', async () => {
    class EmptySearch extends StubProvider {
      override async search(_tenant: TenantConfig, query: string): Promise<SearchResults> {
        return { query, resources: [], relatedQuestions: [] }
      }
    }
    const app = buildApp({
      provider: new EmptySearch(),
      tenants: freshTenants(),
      management: management([]),
    })
    const response = await app.request('/api/t/frdc/entity?name=ZZZZNOTAGENE')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'unknown_entity',
      name: 'ZZZZNOTAGENE',
      unknown: true,
    })
  })
})

describe('GET /api/t/:slug/resources/:id/questions', () => {
  it('serves precomputed openers from the store and never generates on the page path', async () => {
    const enrichments = new EnrichmentStore(Deno.makeTempDirSync())
    enrichments.put('frdc', 'res-1', {
      schemaId: 'suggested-questions',
      generatedAt: new Date().toISOString(),
      data: { questions: ['What drove the decline?'] },
    })
    let generated = 0
    const management = {
      resourceContent: () => {
        generated++
        return Promise.resolve(null)
      },
    } as unknown as AragProvider
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      enrichments,
      management,
    })
    const cached = await app.request('/api/t/frdc/resources/res-1/questions')
    expect(await cached.json()).toEqual({ questions: ['What drove the decline?'] })
    // A resource the pass has not reached answers at once and fills the
    // store in the background rather than holding the page for the model.
    const pending = await app.request('/api/t/frdc/resources/res-2/questions')
    expect(await pending.json()).toEqual({ questions: [], pending: true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(generated).toBe(1)
    expect(enrichments.get('frdc', 'res-2', 'suggested-questions')?.data).toEqual({ questions: [] })
  })
})

describe('GET /api/t/:slug/catalog', () => {
  /** Records what the route asked the provider for. */
  class RecordingProvider extends StubProvider {
    lastOpts: Parameters<RetrievalProvider['catalog']>[1]
    override catalog(tenant: TenantConfig, opts?: Parameters<RetrievalProvider['catalog']>[1]) {
      this.lastOpts = opts
      return super.catalog(tenant)
    }
  }

  it('accepts the documented facet names as well as the short forms', async () => {
    const provider = new RecordingProvider()
    const app = buildApp({ provider, tenants: freshTenants() })
    const response = await app.request(
      '/api/t/frdc/catalog?formatIds=article,media&kindIds=protocol&topicIds=stock-assessment',
    )
    expect(response.status).toBe(200)
    expect(provider.lastOpts?.formatIds).toEqual(['article', 'media'])
    expect(provider.lastOpts?.kindIds).toEqual(['protocol'])
    expect(provider.lastOpts?.topicIds).toEqual(['stock-assessment'])

    await app.request('/api/t/frdc/catalog?format=supplement&kind=case-study&topics=a,b')
    expect(provider.lastOpts?.formatIds).toEqual(['supplement'])
    expect(provider.lastOpts?.kindIds).toEqual(['case-study'])
    expect(provider.lastOpts?.topicIds).toEqual(['a', 'b'])
  })

  it('passes a publication-date sort through and falls back to created otherwise', async () => {
    const provider = new RecordingProvider()
    const app = buildApp({ provider, tenants: freshTenants() })
    await app.request('/api/t/frdc/catalog?sort=published&order=asc')
    expect(provider.lastOpts?.sortField).toBe('published')
    expect(provider.lastOpts?.sortOrder).toBe('asc')

    await app.request('/api/t/frdc/catalog?sort=year')
    expect(provider.lastOpts?.sortField).toBe('created')
    expect(provider.lastOpts?.sortOrder).toBe('desc')
  })
})

describe('GET /api/t/:slug/facets', () => {
  /** Counts every labelset asked for, and records each call so memoisation is observable. */
  class FacetProvider extends StubProvider {
    calls: string[][] = []
    untaggedCalls = 0
    override async facets(_tenant: TenantConfig, labelsets: string[]): Promise<FacetCounts> {
      this.calls.push(labelsets)
      return Object.fromEntries(labelsets.map((ls) => [ls, { [`${ls}-label`]: 3 }]))
    }
    async untaggedCount(_tenant: TenantConfig, _labelset: string): Promise<number> {
      this.untaggedCalls += 1
      return 14
    }
  }

  it('serves the three rail facets by default with a real untagged count', async () => {
    const provider = new FacetProvider()
    const app = buildApp({ provider, tenants: freshTenants() })
    const response = await app.request('/api/t/frdc/facets')
    expect(response.status).toBe(200)
    const body = FacetCountsSchema.parse(await response.json())
    expect(Object.keys(body).sort()).toEqual(['format', 'kind', 'topic', 'untagged'])
    expect(body.untagged).toEqual({ topic: 14 })
  })

  it('accepts labelsets= and ls= alike', async () => {
    const provider = new FacetProvider()
    const app = buildApp({ provider, tenants: freshTenants() })
    const documented = await (await app.request('/api/t/frdc/facets?labelsets=kind,format')).json()
    expect(Object.keys(documented).sort()).toEqual(['format', 'kind'])
    const short = await (await app.request('/api/t/frdc/facets?ls=kind')).json()
    expect(Object.keys(short)).toEqual(['kind'])
  })

  it('answers every rail from one aggregation within the memo window', async () => {
    const provider = new FacetProvider()
    const app = buildApp({ provider, tenants: freshTenants() })
    await app.request('/api/t/frdc/facets?labelsets=topic,kind,format')
    await app.request('/api/t/frdc/facets?labelsets=topic,format')
    await app.request('/api/t/frdc/facets?labelsets=topic,kind')
    // The first call fetched all three; the rest were served from it.
    expect(provider.calls).toEqual([['topic', 'kind', 'format']])
    expect(provider.untaggedCalls).toBe(1)
    // A labelset the window has not seen is fetched on its own.
    await app.request('/api/t/frdc/facets?labelsets=topic,chunk-labels')
    expect(provider.calls).toEqual([['topic', 'kind', 'format'], ['chunk-labels']])
  })
})

describe('POST /api/t/:slug/ask', () => {
  it('streams SSE data lines that parse with AskEventSchema, including a done event', async () => {
    const app = makeApp()
    const response = await app.request('/api/t/frdc/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'What is known about abalone stock health?' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')

    const payload = await response.text()
    const dataLines = payload
      .split('\n\n')
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => chunk.slice('data: '.length))

    expect(dataLines.length).toBeGreaterThan(0)

    const events = dataLines.map((line) => AskEventSchema.parse(JSON.parse(line)))
    expect(events.some((event) => event.type === 'done')).toBe(true)
  })

  it('BUG 1: merchandises sources and citations with the real generated title, never the raw filename/project-code title', async () => {
    // resourceOne's raw title stands in for a raw filename/project code
    // (e.g. "Project 1996-107") the way /search, /catalog and /resources
    // never show one when a real enrichment exists - /ask and /generate must
    // not diverge from that surface-wide rule.
    const enrichment: Enrichment = {
      schemaId: DEFAULT_RESEARCH_ENRICHMENT.id,
      generatedAt: '2026-08-28T00:00:00.000Z',
      data: {
        title: 'Distribution and Ecology of Southern Rock Lobster Larvae',
        summary: 'A study of larval distribution and ecology in southern rock lobster stocks.',
      },
    }
    const store = new EnrichmentStore(Deno.makeTempDirSync())
    store.put('frdc', resourceOne.id, enrichment)
    const app = makeApp(store)

    const response = await app.request('/api/t/frdc/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'What is known about abalone stock health?' }),
    })
    expect(response.status).toBe(200)

    const payload = await response.text()
    const events = payload
      .split('\n\n')
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => AskEventSchema.parse(JSON.parse(chunk.slice('data: '.length))))

    const sourcesEvent = events.find((e) => e.type === 'sources') as
      | { type: 'sources'; resources: { id: string; title: string }[] }
      | undefined
    const citationEvent = events.find((e) => e.type === 'citation') as
      | { type: 'citation'; citation: { resourceId: string; title: string } }
      | undefined

    expect(sourcesEvent?.resources[0]?.title).toBe(
      'Distribution and Ecology of Southern Rock Lobster Larvae',
    )
    expect(sourcesEvent?.resources[0]?.title).not.toBe(resourceOne.title)
    expect(citationEvent?.citation.title).toBe(
      'Distribution and Ecology of Southern Rock Lobster Larvae',
    )
    expect(citationEvent?.citation.title).not.toBe(resourceOne.title)
  })

  it('falls back to the baseline title when no enrichment exists for the cited resource', async () => {
    const app = makeApp(new EnrichmentStore(Deno.makeTempDirSync()))
    const response = await app.request('/api/t/frdc/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'What is known about abalone stock health?' }),
    })
    const payload = await response.text()
    const events = payload
      .split('\n\n')
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.startsWith('data: '))
      .map((chunk) => AskEventSchema.parse(JSON.parse(chunk.slice('data: '.length))))
    const sourcesEvent = events.find((e) => e.type === 'sources') as
      | { type: 'sources'; resources: { title: string }[] }
      | undefined
    expect(sourcesEvent?.resources[0]?.title).toBe(resourceOne.title)
  })
})

describe('admin', () => {
  const passcode = 'test-passcode'

  it('disables the admin surface entirely when no passcode is configured', async () => {
    const app = buildApp({ provider: new StubProvider(), tenants: freshTenants() })
    const response = await app.request('/api/admin/overview')
    expect(response.status).toBe(503)
  })

  it('rejects admin calls without the passcode', async () => {
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      adminPasscode: passcode,
    })
    const response = await app.request('/api/admin/overview')

    expect(response.status).toBe(401)
  })

  it('returns a schema-valid overview with the passcode', async () => {
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      adminPasscode: passcode,
    })
    const response = await app.request('/api/admin/overview', {
      headers: { 'x-admin-passcode': passcode },
    })

    expect(response.status).toBe(200)
    const rows = (await response.json()) as unknown[]
    expect(rows.length).toBe(3)
    for (const row of rows) AdminTenantOverviewSchema.parse(row)
  })

  it('accepts a platform-authenticated administrator without a fallback passcode', async () => {
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      trustedAdmin: (request) => request.headers.get('x-corpuskit-sso-admin') === '1',
    })
    const response = await app.request('/api/admin/overview', {
      headers: { 'x-corpuskit-sso-admin': '1' },
    })

    expect(response.status).toBe(200)
  })

  it('reverting a connected binding falls back to the demo box', async () => {
    const dir = Deno.makeTempDirSync()
    const bindings = new BindingStore({
      BINDINGS_PATH: `${dir}/bindings.json`,
      ARAG_ZONE: 'aws-ap-southeast-2-1',
      ARAG_KB_FRDC: 'demo-kb-id-000000',
      ARAG_KB_FRDC_TOKEN: 'demo-token-00000000000000',
    })
    bindings.set('frdc', {
      baseUrl: 'https://zone.rag.progress.cloud/api/v1/kb/connected-kb-111111',
      token: 'connected-token-1111111111',
      kbId: 'connected-kb-111111',
    })
    expect(bindings.status('frdc').status).toBe('connected')

    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      bindings,
      adminPasscode: passcode,
    })
    const response = await app.request('/api/admin/t/frdc/knowledge-box', {
      method: 'DELETE',
      headers: { 'x-admin-passcode': passcode },
    })

    expect(response.status).toBe(200)
    expect(bindings.status('frdc').status).toBe('demo')
  })
})

describe('admin enrichment import and export', () => {
  const passcode = 'test-passcode'
  const adminHeaders = {
    'x-admin-passcode': passcode,
    'content-type': 'application/json',
  }
  const enrichment = (title: string): Enrichment => ({
    schemaId: DEFAULT_RESEARCH_ENRICHMENT.id,
    generatedAt: '2026-08-28T00:00:00.000Z',
    data: { title, summary: `${title} summary` },
  })
  const appWithStore = () => {
    const store = new EnrichmentStore(Deno.makeTempDirSync())
    return {
      store,
      app: buildApp({
        provider: new StubProvider(),
        tenants: freshTenants(),
        enrichments: store,
        adminPasscode: passcode,
      }),
    }
  }

  it('keeps both bulk routes behind the admin guard', async () => {
    const { app } = appWithStore()
    const exported = await app.request('/api/admin/t/frdc/enrichments/export')
    const imported = await app.request('/api/admin/t/frdc/enrichments/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    expect(exported.status).toBe(401)
    expect(imported.status).toBe(401)
  })

  it('rejects an unknown target tenant before reading an import', async () => {
    const { app } = appWithStore()
    const response = await app.request('/api/admin/t/unknown/enrichments/import', {
      method: 'POST',
      headers: adminHeaders,
      body: '{}',
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'unknown_tenant' })
  })

  it('rejects a malformed archive without writing its valid records', async () => {
    const { app, store } = appWithStore()
    const existing = enrichment('Existing title')
    store.put('frdc', 'existing', existing)
    const response = await app.request('/api/admin/t/frdc/enrichments/import', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        [DEFAULT_RESEARCH_ENRICHMENT.id]: {
          valid: enrichment('Would otherwise be valid'),
          malformed: { generatedAt: '2026-08-28T00:00:00.000Z', data: {} },
        },
      }),
    })

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe('invalid_enrichment_import')
    expect(body.issues[0].path).toContain('malformed')
    expect(store.get('frdc', 'valid')).toBeUndefined()
    expect(store.get('frdc', 'existing')).toEqual(existing)
  })

  it('imports a legacy-slug archive into the URL tenant and exports the store shape', async () => {
    const { app } = appWithStore()
    const archive = {
      [DEFAULT_RESEARCH_ENRICHMENT.id]: {
        'stable-resource-id': enrichment('Restored GRDC title'),
      },
    }
    const imported = await app.request('/api/admin/t/grdc/enrichments/import?collision=skip', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(archive),
    })

    expect(imported.status).toBe(200)
    expect(await imported.json()).toEqual({
      ok: true,
      targetSlug: 'grdc',
      collisionPolicy: 'skip',
      imported: 1,
      skipped: 0,
      overwritten: 0,
      reasons: { existing: 0 },
    })

    const exported = await app.request('/api/admin/t/grdc/enrichments/export', {
      headers: { 'x-admin-passcode': passcode },
    })
    expect(exported.status).toBe(200)
    expect(exported.headers.get('cache-control')).toBe('no-store')
    expect(await exported.json()).toEqual(archive)
  })

  it('defaults to skip-existing and overwrites only when explicitly requested', async () => {
    const { app, store } = appWithStore()
    store.put('frdc', 'same-id', enrichment('Original title'))
    const archive = {
      [DEFAULT_RESEARCH_ENRICHMENT.id]: {
        'same-id': enrichment('Replacement title'),
      },
    }
    const skipped = await app.request('/api/admin/t/frdc/enrichments/import', {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify(archive),
    })
    expect(skipped.status).toBe(200)
    expect(await skipped.json()).toMatchObject({
      collisionPolicy: 'skip',
      imported: 0,
      skipped: 1,
      overwritten: 0,
      reasons: { existing: 1 },
    })
    expect(store.get('frdc', 'same-id')?.data.title).toBe('Original title')

    const overwritten = await app.request(
      '/api/admin/t/frdc/enrichments/import?collision=overwrite',
      {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify(archive),
      },
    )
    expect(overwritten.status).toBe(200)
    expect(await overwritten.json()).toMatchObject({
      collisionPolicy: 'overwrite',
      imported: 1,
      skipped: 0,
      overwritten: 1,
    })
    expect(store.get('frdc', 'same-id')?.data.title).toBe('Replacement title')
  })

  it('rejects a body above the 8 MB import limit', async () => {
    const { app } = appWithStore()
    const response = await app.request('/api/admin/t/frdc/enrichments/import', {
      method: 'POST',
      headers: adminHeaders,
      body: 'x'.repeat(8 * 1024 * 1024 + 1),
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: 'payload_too_large',
      message: 'The enrichment import exceeds the 8 MB limit.',
    })
  })

  it('accepts a 3.8 MB archive in one request', async () => {
    const { app } = appWithStore()
    const bucket: Record<string, Enrichment> = {}
    for (let index = 0; index < 3163; index++) {
      bucket[`resource-${index}`] = {
        schemaId: DEFAULT_RESEARCH_ENRICHMENT.id,
        generatedAt: '2026-08-28T00:00:00.000Z',
        data: {
          title: `Restored resource ${index}`,
          summary: 'x'.repeat(1120),
        },
      }
    }
    const body = JSON.stringify({ [DEFAULT_RESEARCH_ENRICHMENT.id]: bucket })
    const bytes = new TextEncoder().encode(body).byteLength
    expect(bytes).toBeGreaterThan(3_800_000)
    expect(bytes).toBeLessThan(8 * 1024 * 1024)

    const response = await app.request('/api/admin/t/frdc/enrichments/import?collision=skip', {
      method: 'POST',
      headers: adminHeaders,
      body,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ imported: 3163, skipped: 0 })
  })
})

describe('GET /api/health', () => {
  it('returns 200 with ok:true and web:true when the SPA bundle exists', async () => {
    const dir = Deno.makeTempDirSync()
    Deno.writeTextFileSync(`${dir}/index.html`, '<!doctype html>')
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      webDistPath: dir,
    })

    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.web).toBe(true)
    expect(typeof body.version).toBe('string')
  })

  it('returns 503 when the SPA bundle is missing - a bundle-less image fails its health check', async () => {
    const dir = Deno.makeTempDirSync()
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      webDistPath: dir,
    })

    const response = await app.request('/api/health')

    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.ok).toBe(false)
    expect(body.web).toBe(false)
  })

  it('reports documentation readiness per portal without failing liveness (P7-08)', async () => {
    const dir = Deno.makeTempDirSync()
    Deno.writeTextFileSync(`${dir}/index.html`, '<!doctype html>')
    const status = {
      eprepo: { documents: 0, ok: false, checkedAt: '2026-09-04T00:00:00.000Z' },
    }
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      webDistPath: dir,
      docsHealth: {
        snapshot: () => status,
        ok: () => false,
        checkTenant: () => Promise.resolve(status.eprepo),
      },
    })

    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.docsOk).toBe(false)
    expect(body.docs.eprepo.documents).toBe(0)
  })

  it('requires no authentication', async () => {
    const dir = Deno.makeTempDirSync()
    Deno.writeTextFileSync(`${dir}/index.html`, '<!doctype html>')
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      adminPasscode: 'test-passcode',
      webDistPath: dir,
    })

    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
  })
})

describe('appearance (typography, shape, branding fonts)', () => {
  const passcode = 'test-passcode'
  const appearanceApp = () =>
    buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      adminPasscode: passcode,
      brandingPath: `${Deno.makeTempDirSync()}/branding`,
    })
  const patch = (app: ReturnType<typeof buildApp>, body: unknown) =>
    app.request('/api/admin/tenants/frdc', {
      method: 'PATCH',
      headers: { 'x-admin-passcode': passcode, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  it('saves a typography pairing, shape and text scale, and serves them in the tenant config', async () => {
    const app = appearanceApp()
    const response = await patch(app, {
      typography: 'fraunces-poppins',
      shape: 'soft',
      textScale: 'larger',
      density: 'compact',
      paletteId: 'fathom',
    })
    expect(response.status).toBe(200)

    const config = TenantConfigSchema.parse(await (await app.request('/api/t/frdc/config')).json())
    expect(config.branding.typography).toBe('fraunces-poppins')
    expect(config.branding.shape).toBe('soft')
    expect(config.branding.textScale).toBe('larger')
    expect(config.branding.density).toBe('compact')
    expect(config.branding.paletteId).toBe('fathom')
  })

  it('accepts the custom and default typography choices', async () => {
    const app = appearanceApp()
    expect((await patch(app, { typography: 'custom' })).status).toBe(200)
    expect((await patch(app, { typography: 'default', shape: 'square' })).status).toBe(200)
    const config = TenantConfigSchema.parse(await (await app.request('/api/t/frdc/config')).json())
    expect(config.branding.typography).toBe('default')
    expect(config.branding.shape).toBe('square')
  })

  it('persists the choice across a store reload', () => {
    const path = `${Deno.makeTempDirSync()}/tenants.json`
    const store = new TenantStore({ TENANTS_PATH: path })
    store.patchBranding('frdc', { typography: 'lexend-zilla', shape: 'rounded' })
    const reloaded = new TenantStore({ TENANTS_PATH: path })
    expect(reloaded.get('frdc')?.branding.typography).toBe('lexend-zilla')
    expect(reloaded.get('frdc')?.branding.shape).toBe('rounded')
  })

  it('rejects an unknown pairing, shape, text scale or density', async () => {
    const app = appearanceApp()
    expect((await patch(app, { typography: 'comic-sans' })).status).toBe(400)
    expect((await patch(app, { shape: 'blobby' })).status).toBe(400)
    expect((await patch(app, { textScale: 'enormous' })).status).toBe(400)
    expect((await patch(app, { density: 'cramped' })).status).toBe(400)
    expect((await patch(app, { paletteId: 'neon' })).status).toBe(400)
  })

  it('stores an uploaded heading font, exposes its URL and serves it back', async () => {
    const app = appearanceApp()
    const bytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32])
    const upload = await app.request('/api/admin/t/frdc/branding/font-heading', {
      method: 'POST',
      headers: { 'x-admin-passcode': passcode, 'content-type': 'font/woff2' },
      body: bytes,
    })
    expect(upload.status).toBe(200)
    const { url } = (await upload.json()) as { url: string }
    expect(url).toBe('/api/t/frdc/branding/font-heading')

    const config = TenantConfigSchema.parse(await (await app.request('/api/t/frdc/config')).json())
    expect(config.branding.headingFontUrl).toContain('/api/t/frdc/branding/font-heading?v=')
    expect(config.branding.bodyFontUrl).toBeUndefined()

    const served = await app.request('/api/t/frdc/branding/font-heading')
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('font/woff2')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(bytes)
  })

  it('rejects a font upload with a non-font content type', async () => {
    const app = appearanceApp()
    const response = await app.request('/api/admin/t/frdc/branding/font-body', {
      method: 'POST',
      headers: { 'x-admin-passcode': passcode, 'content-type': 'image/png' },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(response.status).toBe(415)
  })

  it('rejects an unknown branding kind', async () => {
    const app = appearanceApp()
    const response = await app.request('/api/admin/t/frdc/branding/favicon', {
      method: 'POST',
      headers: { 'x-admin-passcode': passcode, 'content-type': 'image/png' },
      body: new Uint8Array([1, 2, 3]),
    })
    expect(response.status).toBe(400)
  })
})

describe('GET /api/admin-prefill', () => {
  it('no longer exists - the passcode-prefill endpoint has been removed', async () => {
    const app = makeApp()
    const response = await app.request('/api/admin-prefill')
    expect(response.status).toBe(404)
  })
})

describe('security headers', () => {
  it('sets baseline security headers on every response', async () => {
    const app = makeApp()
    const response = await app.request('/api/tenants')

    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=63072000; includeSubDomains',
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
  })
})

describe('POST /api/ask-estate', () => {
  it('scrubs upstream error detail (URL, knowledge-box id, response body) from anonymous callers', async () => {
    class FailingProvider extends StubProvider {
      override ask(): AsyncIterable<AskEvent> {
        throw new AragApiError(
          500,
          'https://zone.rag.progress.cloud/api/v1/kb/secret-kb-id-111111',
          'super secret upstream response body',
        )
      }
    }

    const app = buildApp({ provider: new FailingProvider(), tenants: freshTenants() })
    const response = await app.request('/api/ask-estate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'What is known about abalone stock health?' }),
    })

    expect(response.status).toBe(200)
    const payload = await response.text()

    expect(payload).not.toContain('secret-kb-id')
    expect(payload).not.toContain('super secret upstream response body')
    expect(payload).not.toContain('zone.rag.progress.cloud')
    expect(payload).toContain('had a problem (HTTP 500)')
  })
})

describe('rate limiting on anonymous LLM-spend routes', () => {
  it('429s an EXPENSIVE route (ask) after the configured per-IP limit, with Retry-After', async () => {
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      rateLimitAskPerMin: 2,
    })
    const ask = () =>
      app.request('/api/t/frdc/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'fly-client-ip': '203.0.113.5' },
        body: JSON.stringify({ query: 'What is known about abalone stock health?' }),
      })

    expect((await ask()).status).toBe(200)
    expect((await ask()).status).toBe(200)
    const third = await ask()

    expect(third.status).toBe(429)
    expect(await third.json()).toEqual({ error: 'rate_limited' })
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0)
  })

  it('isolates the limit per client IP - a different caller is unaffected', async () => {
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      rateLimitAskPerMin: 1,
    })
    const askAs = (ip: string) =>
      app.request('/api/t/frdc/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'fly-client-ip': ip },
        body: JSON.stringify({ query: 'What is known about abalone stock health?' }),
      })

    expect((await askAs('203.0.113.1')).status).toBe(200)
    expect((await askAs('203.0.113.1')).status).toBe(429)
    expect((await askAs('203.0.113.2')).status).toBe(200)
  })

  it('applies the ESTATE tier (not the EXPENSIVE tier) to POST /api/ask-estate', async () => {
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      rateLimitAskPerMin: 20,
      rateLimitEstatePerMin: 1,
    })
    const askEstate = () =>
      app.request('/api/ask-estate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'fly-client-ip': '203.0.113.9' },
        body: JSON.stringify({ query: 'What is known about abalone stock health?' }),
      })

    expect((await askEstate()).status).toBe(200)
    const second = await askEstate()
    expect(second.status).toBe(429)
  })

  it('0 disables the EXPENSIVE tier entirely', async () => {
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      rateLimitAskPerMin: 0,
    })
    const ask = () =>
      app.request('/api/t/frdc/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'fly-client-ip': '203.0.113.5' },
        body: JSON.stringify({ query: 'What is known about abalone stock health?' }),
      })

    for (let i = 0; i < 25; i++) {
      expect((await ask()).status).toBe(200)
    }
  })

  it('never rate-limits admin routes, even past the EXPENSIVE per-IP limit', async () => {
    const passcode = 'test-passcode'
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      adminPasscode: passcode,
      rateLimitAskPerMin: 1,
    })
    const headers = { 'x-admin-passcode': passcode, 'fly-client-ip': '203.0.113.5' }

    for (let i = 0; i < 5; i++) {
      const response = await app.request('/api/admin/overview', { headers })
      expect(response.status).toBe(200)
    }
  })
})

// ---------------------------------------------------------------------------
// Grounding gate, intent fallback and answer shaping on POST /ask
// ---------------------------------------------------------------------------

const sseEvents = async (response: Response): Promise<AskEvent[]> =>
  (await response.text())
    .split('\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => AskEventSchema.parse(JSON.parse(chunk.slice('data: '.length))))

describe('POST /api/t/:slug/ask grounding gate', () => {
  it('declines before generating when the pre-flight find is weak, showing the closest matches', async () => {
    let askCalls = 0
    class WeakProvider extends StubProvider {
      override async search(tenant: TenantConfig, query: string): Promise<SearchResults> {
        const found = await super.search(tenant, query)
        return {
          ...found,
          resources: found.resources.map((r) => ({ ...r, relevance: 0.2 })),
        }
      }
      override ask(tenant: TenantConfig, query: string): AsyncIterable<AskEvent> {
        askCalls += 1
        return super.ask(tenant, query)
      }
    }
    const app = buildApp({ provider: new WeakProvider(), tenants: freshTenants() })
    const response = await app.request('/api/t/frdc/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'What is the abalone harvest quota on Mars?' }),
    })
    expect(response.status).toBe(200)
    const events = await sseEvents(response)
    expect(askCalls).toBe(0)
    const sources = events.find((e) => e.type === 'sources')
    expect(sources && sources.type === 'sources' ? sources.resources.length : 0).toBeGreaterThan(0)
    const deltas = events.filter((e) => e.type === 'delta').map((e) =>
      e.type === 'delta' ? e.text : ''
    )
    expect(deltas.join('')).toContain('only weakly related (best match 20%)')
    const done = events.find((e) => e.type === 'done')
    expect(done && done.type === 'done' ? done.refused : false).toBe(true)
    expect(events.some((e) => e.type === 'citation')).toBe(false)
  })

  it('falls back from a supplements-only intent to the general configuration when it finds nothing', async () => {
    const seen: (string | undefined)[] = []
    class SupplementAwareProvider extends StubProvider {
      override async search(
        tenant: TenantConfig,
        query: string,
        opts?: { intent?: string },
      ): Promise<SearchResults> {
        seen.push(opts?.intent)
        if (opts?.intent === 'data') return { query, resources: [], relatedQuestions: [] }
        return super.search(tenant, query)
      }
      override ask(tenant: TenantConfig, query: string, opts?: { intent?: string }) {
        seen.push(`ask:${opts?.intent ?? 'none'}`)
        return super.ask(tenant, query)
      }
    }
    const app = buildApp({ provider: new SupplementAwareProvider(), tenants: freshTenants() })
    const response = await app.request('/api/t/eprepo/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'What seizure freedom rates are reported after thermocoagulation?',
        intent: 'data',
      }),
    })
    expect(response.status).toBe(200)
    const events = await sseEvents(response)
    const fallback = events.find((e) => e.type === 'fallback')
    expect(fallback && fallback.type === 'fallback' ? fallback.from : null).toBe('data')
    expect(seen).toEqual(['data', undefined, 'ask:none'])
    expect(events.some((e) => e.type === 'done' && !e.refused)).toBe(true)
  })

  it('withholds a model-authored reference list from the stream and the bound text', async () => {
    class ReferencingProvider extends StubProvider {
      override async *ask(): AsyncIterable<AskEvent> {
        yield { type: 'sources', resources: [{ ...resourceOne, relevance: 0.9, citedCount: 1 }] }
        yield { type: 'delta', text: 'Abalone stocks are recovering [1].' }
        yield { type: 'delta', text: '\n\n---\n\n**References:**\n' }
        yield { type: 'delta', text: '1. Study on abalone recovery.\n2. Study on stressors.' }
        yield {
          type: 'citation',
          citation: { index: 1, resourceId: resourceOne.id, title: resourceOne.title },
        }
        yield {
          type: 'done',
          text:
            'Abalone stocks are recovering.[1]\n\n---\n\n**References:**\n1. Study on abalone recovery.',
        }
      }
    }
    const app = buildApp({ provider: new ReferencingProvider(), tenants: freshTenants() })
    const response = await app.request('/api/t/frdc/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'Are abalone stocks recovering?' }),
    })
    const events = await sseEvents(response)
    const streamed = events.filter((e) => e.type === 'delta').map((e) =>
      e.type === 'delta' ? e.text : ''
    )
      .join('')
    expect(streamed).toBe('Abalone stocks are recovering [1].')
    const done = events.find((e) => e.type === 'done')
    expect(done && done.type === 'done' ? done.text : null).toBe(
      'Abalone stocks are recovering.[1]',
    )
  })
})

describe('rate limiting per browser id', () => {
  it('keys the ask limit on x-rp-client so callers behind one address get their own budget', async () => {
    const app = buildApp({
      provider: new StubProvider(),
      tenants: freshTenants(),
      rateLimitAskPerMin: 1,
      rateLimitAskPerMinPerIp: 2,
    })
    const askAs = (client: string) =>
      app.request('/api/t/frdc/ask', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'fly-client-ip': '203.0.113.9',
          'x-rp-client': client,
        },
        body: JSON.stringify({ query: 'What is known about abalone stock health?' }),
      })

    expect((await askAs('client-aaaaaaaa')).status).toBe(200)
    expect((await askAs('client-aaaaaaaa')).status).toBe(429)
    expect((await askAs('client-bbbbbbbb')).status).toBe(200)
    // The wider per-address bucket still caps a caller that mints new ids.
    expect((await askAs('client-cccccccc')).status).toBe(429)
  })
})

describe('POST /api/t/:slug/ask refusal fallback', () => {
  it('re-asks on the general configuration when a supplements-only intent refuses outright', async () => {
    const seen: string[] = []
    class RefusingOnDataProvider extends StubProvider {
      override async *ask(
        tenant: TenantConfig,
        query: string,
        opts?: { intent?: string },
      ): AsyncIterable<AskEvent> {
        seen.push(`ask:${opts?.intent ?? 'none'}`)
        if (opts?.intent === 'data') {
          yield { type: 'sources', resources: [{ ...resourceOne, relevance: 0.9, citedCount: 0 }] }
          yield { type: 'delta', text: 'This portal does not hold enough material to answer.' }
          yield { type: 'done', refused: true }
          return
        }
        yield* super.ask(tenant, query)
      }
    }
    const app = buildApp({ provider: new RefusingOnDataProvider(), tenants: freshTenants() })
    const response = await app.request('/api/t/eprepo/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'What seizure freedom is reported?', intent: 'data' }),
    })
    const events = await sseEvents(response)
    expect(seen).toEqual(['ask:data', 'ask:none'])
    expect(events.filter((e) => e.type === 'fallback').length).toBe(1)
    const dones = events.filter((e) => e.type === 'done')
    expect(dones.length).toBe(1)
    expect(dones[0] && dones[0].type === 'done' ? dones[0].refused : true).toBeFalsy()
    expect(events.some((e) => e.type === 'citation')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Sentence-level binding, the audit, refusals and sentinels on POST /ask
// ---------------------------------------------------------------------------

const CONSENSUS_TEXT =
  'International consensus on diagnosis and management of Dravet syndrome. Sodium channel ' +
  'blockers should be avoided. Lamotrigine is contraindicated in children with DS. In the ' +
  'register, the malformation rate was 6.42% below 1400 mg per day.'
const TRIAL_TEXT =
  'Dose-ranging trial of cannabidiol in Dravet syndrome: the 20 mg/kg group had a 45.7% ' +
  'reduction in convulsive seizure frequency. Participants were on stable therapy.'

/** The management surface the ask handler needs, as a double. */
function fakeManagement(texts: Record<string, string>): AragProvider {
  return {
    resourceExtraction: (_tenant: TenantConfig, id: string) =>
      Promise.resolve({
        status: 'PROCESSED',
        text: texts[id] ?? '',
        chars: 0,
        paragraphs: 0,
        tableRows: 0,
      }),
    rephrase: () => Promise.resolve(null),
    askStructured: () => Promise.reject(new Error('not in this test')),
  } as unknown as AragProvider
}

describe('POST /api/t/:slug/ask sentence-level binding and audit', () => {
  it('re-binds each sentence to the text that carries it, renumbers, and audits the figures', async () => {
    class SprayingProvider extends StubProvider {
      override async *ask(): AsyncIterable<AskEvent> {
        yield {
          type: 'sources',
          resources: [
            { ...resourceOne, relevance: 0.9, citedCount: 1 },
            { ...resourceTwo, relevance: 0.8, citedCount: 1 },
          ],
        }
        yield { type: 'delta', text: 'Lamotrigine is contraindicated in Dravet syndrome. ' }
        yield { type: 'delta', text: 'Cannabidiol at 20 mg/kg cut seizures by 45.7%. ' }
        yield { type: 'delta', text: 'The malformation rate was 9.9% below 1400 mg.' }
        yield { type: 'citation', citation: { index: 1, resourceId: 'res-2', title: 'Trial' } }
        yield { type: 'citation', citation: { index: 2, resourceId: 'res-1', title: 'Consensus' } }
        yield {
          type: 'done',
          text: 'Lamotrigine is contraindicated in Dravet syndrome. ' +
            'Cannabidiol at 20 mg/kg cut seizures by 45.7%. ' +
            'The malformation rate was 9.9% below 1400 mg.[1][2]',
        }
        yield {
          type: 'quality',
          answerRelevance: 4,
          groundedness: 3,
          contextRelevance: 2,
        }
      }
    }
    const app = buildApp({
      provider: new SprayingProvider(),
      tenants: freshTenants(),
      management: fakeManagement({ 'res-1': CONSENSUS_TEXT, 'res-2': TRIAL_TEXT }),
    })
    const response = await app.request('/api/t/eprepo/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'Which drugs are contraindicated in Dravet?' }),
    })
    const events = await sseEvents(response)
    const citations = events.filter((e) => e.type === 'citation').map((e) =>
      e.type === 'citation' ? [e.citation.index, e.citation.resourceId] : null
    )
    // The consensus grounds the first sentence and is cited first, so it is [1].
    expect(citations).toEqual([[1, 'res-1'], [2, 'res-2']])
    const done = events.find((e) => e.type === 'done')
    const text = done && done.type === 'done' ? done.text ?? '' : ''
    expect(text).toContain('Lamotrigine is contraindicated in Dravet syndrome.[1]')
    expect(text).toContain('cut seizures by 45.7%.[2]')
    // 9.9% appears in neither text: the sentence loses its markers (a text
    // must carry every figure a sentence states) and the figure is flagged.
    expect(text).toMatch(/9\.9% below 1400 mg\.(?!\[)/)
    expect(text).toContain('do not appear beside their claim in the cited passages: 9.9%')
    const audit = events.find((e) => e.type === 'audit')
    expect(audit && audit.type === 'audit' ? audit : null).toMatchObject({
      figuresChecked: 4,
      figuresUnsupported: ['9.9%'],
      yearsUnsupported: [],
      contraindicationsUnsupported: [],
    })
    // Every citation event precedes done; the quality judge's event follows it.
    const order = events.map((e) => e.type)
    expect(order.indexOf('done')).toBeGreaterThan(order.lastIndexOf('citation'))
    expect(order.indexOf('quality')).toBeGreaterThan(order.indexOf('done'))
  })

  it('strips a contraindication no cited passage states and says so', async () => {
    class OverclaimingProvider extends StubProvider {
      override async *ask(): AsyncIterable<AskEvent> {
        yield { type: 'sources', resources: [{ ...resourceTwo, relevance: 0.9, citedCount: 1 }] }
        yield { type: 'delta', text: 'Yes, vigabatrin is contraindicated in Dravet syndrome.' }
        yield { type: 'citation', citation: { index: 1, resourceId: 'res-2', title: 'Trial' } }
        yield { type: 'done', text: 'Yes, vigabatrin is contraindicated in Dravet syndrome.[1]' }
      }
    }
    const app = buildApp({
      provider: new OverclaimingProvider(),
      tenants: freshTenants(),
      management: fakeManagement({ 'res-2': TRIAL_TEXT + ' Vigabatrin was a concomitant drug.' }),
    })
    const response = await app.request('/api/t/eprepo/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'Is vigabatrin contraindicated in Dravet syndrome?',
        intent: 'clinical',
      }),
    })
    const events = await sseEvents(response)
    const done = events.find((e) => e.type === 'done')
    const text = done && done.type === 'done' ? done.text ?? '' : ''
    expect(text).toContain('The cited sources do not state that vigabatrin is contraindicated')
    expect(text).not.toContain('Yes, vigabatrin is contraindicated')
    const audit = events.find((e) => e.type === 'audit')
    expect(audit && audit.type === 'audit' ? audit.contraindicationsUnsupported : []).toEqual([
      'vigabatrin',
    ])
  })

  it('fires the safety prequeries for a medication on a treatment question, never for an antigen', async () => {
    const app = makeApp()
    const searched = async (query: string) => {
      const response = await app.request('/api/t/eprepo/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, intent: 'clinical' }),
      })
      const events = await sseEvents(response)
      const event = events.find((e) => e.type === 'searched')
      return event && event.type === 'searched' ? event.queries : []
    }
    expect(await searched('What rituximab dose was used for NMDAR encephalitis?')).toEqual([])
    expect(await searched('Should valproate be avoided in women of childbearing age?')).toEqual([
      'contraindications, drugs to avoid and safety monitoring for valproate',
      'dose limits, starting dose and interactions for valproate',
    ])
  })
})

describe('POST /api/t/:slug/ask refusals and sentinels', () => {
  it('shows the closest matches on a refusal and names them in the decline', async () => {
    class RefusingProvider extends StubProvider {
      override async *ask(): AsyncIterable<AskEvent> {
        yield {
          type: 'sources',
          resources: [
            { ...resourceOne, relevance: 0.6, citedCount: 0 },
            { ...resourceTwo, relevance: 0.4, citedCount: 0 },
          ],
        }
        yield {
          type: 'delta',
          text: "This portal's content does not hold enough relevant material to answer this " +
            'confidently. Try rephrasing the question.',
        }
        yield { type: 'sources', resources: [] }
        yield { type: 'done', refused: true, text: "This portal's content does not hold enough." }
      }
    }
    const app = buildApp({ provider: new RefusingProvider(), tenants: freshTenants() })
    const response = await app.request('/api/t/frdc/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'What is the abalone quota in the Baltic?' }),
    })
    const events = await sseEvents(response)
    const sources = events.filter((e) => e.type === 'sources')
    expect(sources.length).toBe(2)
    expect(sources.every((e) => e.type === 'sources' && e.resources.length === 2)).toBe(true)
    const done = events.find((e) => e.type === 'done')
    const text = done && done.type === 'done' ? done.text ?? '' : ''
    expect(done && done.type === 'done' ? done.refused : false).toBe(true)
    expect(text).toContain("This portal's sources do not answer this question directly")
    expect(text).toContain(
      `*${resourceOne.title}* and *${resourceTwo.title}* - listed below but not used`,
    )
    expect(text).not.toContain('does not hold enough relevant material')
    // The provider's own decline copy never reaches the stream.
    const streamed = events.filter((e) => e.type === 'delta').map((e) =>
      e.type === 'delta' ? e.text : ''
    ).join('')
    expect(streamed).not.toContain('does not hold enough')
  })

  it('re-asks once without the safety prequeries when a strong match still refuses', async () => {
    const seen: (string[] | undefined)[] = []
    class ProbeSensitiveProvider extends StubProvider {
      override async *ask(
        tenant: TenantConfig,
        query: string,
        opts?: { prequeries?: string[] },
      ): AsyncIterable<AskEvent> {
        seen.push(opts?.prequeries)
        if (opts?.prequeries?.length) {
          yield { type: 'sources', resources: [{ ...resourceOne, relevance: 0.95, citedCount: 0 }] }
          yield {
            type: 'delta',
            text: "This portal's content does not hold enough relevant material.",
          }
          yield { type: 'sources', resources: [] }
          yield { type: 'done', refused: true }
          return
        }
        yield* super.ask(tenant, query)
      }
    }
    const app = buildApp({ provider: new ProbeSensitiveProvider(), tenants: freshTenants() })
    const response = await app.request('/api/t/eprepo/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: 'What rituximab dose should be used with clobazam?',
        intent: 'clinical',
      }),
    })
    const events = await sseEvents(response)
    expect(seen.length).toBe(2)
    expect(seen[0]?.length).toBeGreaterThan(0)
    expect(seen[1]).toBeUndefined()
    const dones = events.filter((e) => e.type === 'done')
    expect(dones.length).toBe(1)
    expect(dones[0] && dones[0].type === 'done' ? dones[0].refused : true).toBe(false)
  })

  it('uses the document-scope decline for a per-document ask', async () => {
    class RefusingProvider extends StubProvider {
      override async *ask(): AsyncIterable<AskEvent> {
        yield {
          type: 'delta',
          text: "This portal's content does not hold enough relevant material.",
        }
        yield { type: 'done', refused: true }
      }
    }
    const app = buildApp({ provider: new RefusingProvider(), tenants: freshTenants() })
    const response = await app.request('/api/t/frdc/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'Is the code available?', resourceId: 'res-1' }),
    })
    const events = await sseEvents(response)
    const done = events.find((e) => e.type === 'done')
    expect(done && done.type === 'done' ? done.text : '').toContain(
      'This document does not state an answer to that question',
    )
  })

  it('rewrites sentinel phrases in the streamed text and the final text', async () => {
    class LeakyProvider extends StubProvider {
      override async *ask(): AsyncIterable<AskEvent> {
        yield { type: 'sources', resources: [{ ...resourceOne, relevance: 0.9, citedCount: 1 }] }
        yield { type: 'delta', text: 'The context does not provide a quota [inference]. ' }
        yield { type: 'delta', text: 'Stocks fell 12% since 2019. Not enough data to answer this.' }
        yield { type: 'citation', citation: { index: 1, resourceId: 'res-1', title: 'Abalone' } }
        yield {
          type: 'done',
          text:
            'The context does not provide a quota [inference]. Stocks fell 12% since 2019.[1] ' +
            'Not enough data to answer this.',
        }
      }
    }
    const app = buildApp({ provider: new LeakyProvider(), tenants: freshTenants() })
    const response = await app.request('/api/t/frdc/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'What is the abalone quota?' }),
    })
    const events = await sseEvents(response)
    const streamed = events.filter((e) => e.type === 'delta').map((e) =>
      e.type === 'delta' ? e.text : ''
    ).join('')
    expect(streamed).toContain('The cited sources do not provide a quota (inference).')
    expect(streamed).not.toContain('Not enough data')
    const done = events.find((e) => e.type === 'done')
    expect(done && done.type === 'done' ? done.text : '').toBe(
      'The cited sources do not provide a quota (inference). Stocks fell 12% since 2019.[1]',
    )
  })
})
