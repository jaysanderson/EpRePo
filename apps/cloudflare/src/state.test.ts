import { expect } from '@std/expect'
import type { McpKeyRecord } from '../../api/src/stores.ts'
import { DurableMcpKeyStore, type DurableState } from './state.ts'

Deno.test('DurableMcpKeyStore mirrors tenant isolation and immediate revocation', () => {
  const values = new Map<string, unknown>()
  const state = {
    get<T>(key: string, fallback: T): T {
      return structuredClone((values.get(key) ?? fallback) as T)
    },
    put(key: string, value: unknown): void {
      values.set(key, structuredClone(value))
    },
  } as unknown as DurableState
  const store = new DurableMcpKeyStore(state)
  const record: McpKeyRecord = {
    id: 'key-1',
    tenant: 'frdc',
    issuerUserId: 'user-1',
    label: 'Research client',
    prefix: 'ck_mcp_abcdefghijkl',
    hash: 'b'.repeat(64),
    createdAt: '2026-09-01T00:00:00.000Z',
    revokedAt: null,
  }

  store.add(record)
  expect(store.findByPrefix('frdc', record.prefix)?.issuerUserId).toBe('user-1')
  expect(store.findByPrefix('grdc', record.prefix)).toBeUndefined()
  expect(store.revoke('frdc', record.id, '2026-09-01T01:00:00.000Z')).toBe(true)
  expect(store.findByPrefix('frdc', record.prefix)?.revokedAt).toBe(
    '2026-09-01T01:00:00.000Z',
  )
})
