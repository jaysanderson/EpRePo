import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { TenantConfigSchema } from '@research-portal/core'
import {
  intentConfigurationName,
  intentFilterExpression,
  intentSearchConfigs,
  intentStrategies,
  researchExcludeFilterExpression,
  shapeSourcesForIntent,
} from './index.ts'

const tenant = TenantConfigSchema.parse({
  slug: 't',
  branding: {
    productName: 'P',
    organisation: 'O',
    tagline: 'T',
    colours: { primary: '#000', accent: '#111', heroFrom: '#222', heroTo: '#333' },
  },
  searchPlaceholder: 's',
  topics: [],
  suggestedQuestions: [],
  entityTypes: [],
  relationTypes: [],
  defaultIntent: 'general',
  intents: [
    {
      id: 'lookup',
      label: 'Lookup',
      description: '',
      retrieval: { features: ['keyword'], topK: 30, reranker: 'noop' },
      answer: { surfaces: ['search'], strategy: 'none', promptVariant: 'default' },
    },
    {
      id: 'data',
      label: 'Data',
      description: '',
      retrieval: {
        features: ['keyword', 'semantic'],
        topK: 20,
        reranker: 'predict',
        only: [{ labelset: 'format', label: 'supplement' }],
      },
      answer: {
        surfaces: ['ask', 'search'],
        strategy: 'neighbours',
        neighbours: 4,
        promptVariant: 'data',
      },
    },
    {
      id: 'general',
      label: 'General',
      description: '',
      retrieval: { features: ['keyword', 'semantic'], topK: 20, reranker: 'predict' },
      answer: { surfaces: ['ask', 'search'], strategy: 'neighbours', promptVariant: 'default' },
    },
  ],
})

describe('intent search configurations', () => {
  it('derives one stored configuration per surface, skipping the default intent', () => {
    const configs = intentSearchConfigs(tenant)
    expect(Object.keys(configs).sort()).toEqual([
      'portal-intent-data',
      'portal-intent-data-find',
      'portal-intent-lookup',
    ])
    const lookup = configs['portal-intent-lookup'] as {
      kind: string
      config: Record<string, unknown>
    }
    expect(lookup.kind).toBe('find')
    expect(lookup.config.features).toEqual(['keyword'])
    expect(lookup.config.reranker).toBe('noop')
    expect(lookup.config.top_k).toBe(30)
    const data = configs['portal-intent-data'] as { kind: string; config: Record<string, unknown> }
    expect(data.kind).toBe('ask')
    expect(data.config.citations).toBe(true)
  })

  it('names the default intent after the default pair', () => {
    expect(intentConfigurationName(tenant, 'general', 'ask')).toBe('portal-ask')
    expect(intentConfigurationName(tenant, 'general', 'find')).toBe('portal-search')
    expect(intentConfigurationName(tenant, 'lookup', 'find')).toBe('portal-intent-lookup')
    expect(intentConfigurationName(tenant, 'data', 'find')).toBe('portal-intent-data-find')
  })

  it('builds an only-filter that still excludes documentation, and leaves the plain shape alone', () => {
    const only = intentFilterExpression({ only: [{ labelset: 'format', label: 'supplement' }] })
    expect(only).toEqual({
      field: {
        and: [
          { not: { prop: 'label', labelset: 'content-type', label: 'documentation' } },
          { prop: 'label', labelset: 'format', label: 'supplement' },
        ],
      },
    })
    expect(intentFilterExpression({})).toEqual(researchExcludeFilterExpression())
  })

  it('maps the portal half to strategies and shapes sources', () => {
    const data = tenant.intents!.find((i) => i.id === 'data')!
    expect(intentStrategies(data)).toEqual([{
      name: 'neighbouring_paragraphs',
      before: 4,
      after: 4,
    }])
    const sources = [
      { id: 'a', relevance: 0.2, published: '2020-01-01' },
      { id: 'b', relevance: 0.9, published: '2024-01-01' },
    ] as unknown as Parameters<typeof shapeSourcesForIntent>[0]
    expect(
      shapeSourcesForIntent(sources, {
        ...data,
        answer: { ...data.answer, minScore: 0.5, sortByPublished: true },
      }).map((s) => s.id),
    ).toEqual(['b', 'a'])
    expect(shapeSourcesForIntent(sources, undefined)).toHaveLength(2)
  })
})
