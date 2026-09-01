import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import type { KgProposal, TenantConfig } from '@research-portal/core'
import type { AragProvider } from '@research-portal/retrieval'
import { implementKgStrategy, replaceGraphStrategy } from './kg.ts'

const TENANT: TenantConfig = {
  slug: 'frdc',
  branding: {
    productName: 'FRDC Research Portal',
    organisation: 'FRDC',
    tagline: 'Fisheries research, cited.',
    colours: { primary: '#000', accent: '#111', heroFrom: '#222', heroTo: '#333' },
  },
  searchPlaceholder: 'Search',
  topics: [],
  suggestedQuestions: [],
  entityTypes: [],
  relationTypes: [],
}

const PROPOSAL: KgProposal = {
  rationale: 'Extract the entities and labels researchers use.',
  entityTypes: [{ label: 'Species', description: 'A fishery species' }],
  resourceLabels: [{ label: 'Assessment', description: 'A stock assessment' }],
  chunkLabels: [{ label: 'Finding', description: 'A research finding' }],
  examples: [{
    text: 'Abalone stocks improved after management changes.',
    entities: [
      { name: 'Abalone', label: 'Species' },
      { name: 'stocks', label: 'Species' },
    ],
    relations: [{ source: 'Abalone', target: 'stocks', label: 'has' }],
  }],
}

type StartedAgent = Parameters<AragProvider['startAgent']>[1]

function managementDouble(model: string): {
  management: AragProvider
  starts: StartedAgent[]
  answerModelCalls: () => number
} {
  const starts: StartedAgent[] = []
  let answerModelCalls = 0
  const management = {
    augmentationModel: () => Promise.resolve(model),
    generativeModel: () => {
      answerModelCalls += 1
      return Promise.resolve('chatgpt-azure-4o')
    },
    createLabelset: () => Promise.resolve(),
    listAgents: () => Promise.resolve([]),
    labelsets: () => Promise.resolve([]),
    startAgent: (_tenant: TenantConfig, input: StartedAgent) => {
      starts.push(input)
      return Promise.resolve()
    },
    deleteAgent: () => Promise.resolve(),
  } as unknown as AragProvider
  return { management, starts, answerModelCalls: () => answerModelCalls }
}

describe('knowledge-graph data-augmentation agents', () => {
  it('pins bulk agents to the augmentation model and never starts synthetic questions', async () => {
    const { management, starts, answerModelCalls } = managementDouble('cheap-extraction-model')

    for await (
      const _event of implementKgStrategy(management, TENANT, PROPOSAL, {
        applyExisting: true,
        includeSummaries: true,
      })
    ) {
      // Drain the implementation stream.
    }

    expect(answerModelCalls()).toBe(0)
    expect(starts.map((agent) => agent.task)).toEqual([
      'llm-graph',
      'labeler',
      'labeler',
      'ask',
    ])
    expect(starts.every((agent) => agent.model === 'cheap-extraction-model')).toBe(true)
    expect(starts.some((agent) => agent.task === 'synthetic-questions')).toBe(false)
  })

  it('uses the augmentation model when replacing the graph agent', async () => {
    const { management, starts, answerModelCalls } = managementDouble('cheap-extraction-model')
    const example = PROPOSAL.examples[0]!

    for await (
      const _event of replaceGraphStrategy(management, TENANT, {
        entityTypes: PROPOSAL.entityTypes,
        examples: Array.from({ length: 6 }, (_, index) => ({
          ...example,
          text: `${example.text} Example ${index + 1}.`,
        })),
        applyExisting: true,
      })
    ) {
      // Drain the replacement stream.
    }

    expect(answerModelCalls()).toBe(0)
    expect(starts).toHaveLength(1)
    expect(starts[0]?.task).toBe('llm-graph')
    expect(starts[0]?.model).toBe('cheap-extraction-model')
  })
})
