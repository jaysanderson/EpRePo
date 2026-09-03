import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { IntentSchema } from '@research-portal/core'
import {
  decideFromClassifier,
  extractEntities,
  fillPrequeries,
  routeByRules,
} from './intent-router.ts'

const base = {
  description: '',
  retrieval: { features: ['keyword', 'semantic'], topK: 20, reranker: 'predict' },
  answer: { surfaces: ['ask'], strategy: 'neighbours', promptVariant: 'default' },
}
const intents = [
  {
    ...base,
    id: 'lookup',
    label: 'Exact lookup',
    rules: ['^\\s*(PMC\\d+|[A-Z][A-Z0-9]{2,7})\\s*$'],
  },
  {
    ...base,
    id: 'data',
    label: 'Supplementary data',
    rules: ['supplement|data sheet|sample size'],
  },
  { ...base, id: 'latest', label: 'Latest evidence', rules: ['\\b(latest|newest|recent)\\b'] },
  {
    ...base,
    id: 'clinical',
    label: 'Clinical decision',
    rules: ['\\b(dose|dosing|avoid|contraindicat|which asm)'],
    requireEntity: true,
  },
  { ...base, id: 'review', label: 'Evidence review', rules: ['\\b(compare|what is known)\\b'] },
  { ...base, id: 'general', label: 'General' },
].map((i) => IntentSchema.parse(i))
const ctx = {
  intents,
  defaultIntent: 'general',
  lexicon: ['fenfluramine', 'lamotrigine', 'stiripentol'],
}

describe('extractEntities', () => {
  it('finds gene symbols and lexicon drugs, once each, and skips acronyms that are not entities', () => {
    expect(extractEntities('SCN1A and scn1a with fenfluramine and EEG and PMC123', ctx.lexicon))
      .toEqual(['SCN1A', 'fenfluramine'])
  })
})

describe('routeByRules', () => {
  it('routes an identifier to lookup', () => {
    expect(routeByRules('SCN8A', ctx)?.intent).toBe('lookup')
    expect(routeByRules('PMC8371239', ctx)?.configuration).toBe('portal-intent-lookup')
  })
  it('routes a dosing question with a drug to clinical, and without an entity falls through', () => {
    const d = routeByRules('Fenfluramine dose with stiripentol?', ctx)
    expect(d?.intent).toBe('clinical')
    expect(d?.entities).toEqual(['fenfluramine', 'stiripentol'])
    expect(routeByRules('what dose should I use', ctx)).toBeNull()
  })
  it('returns null when nothing fires and marks the default configuration name', () => {
    expect(routeByRules('How does the ketogenic diet work?', ctx)).toBeNull()
  })
})

describe('fillPrequeries', () => {
  it('substitutes entities, falling back to the question', () => {
    expect(fillPrequeries(['safety monitoring for {entities}'], 'q', ['fenfluramine']))
      .toEqual(['safety monitoring for fenfluramine'])
    expect(fillPrequeries(['{query} published 2026'], 'CBD in focal epilepsy', []))
      .toEqual(['CBD in focal epilepsy published 2026'])
  })
})

describe('decideFromClassifier', () => {
  it('accepts a known intent above the threshold and rejects the rest', () => {
    expect(decideFromClassifier({ intent: 'review', confidence: 0.8, rationale: 'r' }, ctx).stage)
      .toBe('classifier')
    expect(decideFromClassifier({ intent: 'review', confidence: 0.4 }, ctx).intent).toBe('general')
    expect(decideFromClassifier({ intent: 'nope', confidence: 0.9 }, ctx).stage).toBe('default')
    expect(decideFromClassifier({ intent: 'general', confidence: 0.9 }, ctx).configuration).toBe(
      'portal-ask',
    )
  })
})
