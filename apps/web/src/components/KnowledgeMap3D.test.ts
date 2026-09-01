import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { scheduleMapReadyAfterPaint } from './KnowledgeMap3D.tsx'

const [graphPage, mapSource] = await Promise.all([
  Deno.readTextFile(new URL('../pages/GraphPage.tsx', import.meta.url)),
  Deno.readTextFile(new URL('./KnowledgeMap.tsx', import.meta.url)),
])

function frameHarness() {
  let nextId = 1
  let pending = new Map<number, FrameRequestCallback>()

  return {
    schedule(callback: FrameRequestCallback) {
      const id = nextId++
      pending.set(id, callback)
      return id
    },
    cancel(id: number) {
      pending.delete(id)
    },
    flush() {
      const frame = pending
      pending = new Map()
      for (const callback of frame.values()) callback(0)
    },
    get pendingCount() {
      return pending.size
    },
  }
}

describe('KnowledgeMap3D readiness', () => {
  it('reveals only after the settled scene has crossed a paint boundary', () => {
    const frames = frameHarness()
    let ready = false

    scheduleMapReadyAfterPaint(
      () => ready = true,
      (callback) => frames.schedule(callback),
      (id) => frames.cancel(id),
    )

    expect(frames.pendingCount).toBe(1)
    frames.flush()
    expect(ready).toBe(false)
    expect(frames.pendingCount).toBe(1)
    frames.flush()
    expect(ready).toBe(true)
  })

  it('cancels a stale reveal when the scene changes or unmounts', () => {
    const frames = frameHarness()
    let calls = 0
    const cancel = scheduleMapReadyAfterPaint(
      () => calls += 1,
      (callback) => frames.schedule(callback),
      (id) => frames.cancel(id),
    )

    frames.flush()
    cancel()
    frames.flush()

    expect(calls).toBe(0)
  })
})

describe('knowledge map loading state', () => {
  it('keeps loading accessible without restoring the visible loader', () => {
    expect(graphPage).toContain('aria-busy={mapBusy}')
    expect(graphPage).toContain("mapBusy ? 'Loading knowledge map.'")
    expect(graphPage).toContain("hasGraph ? 'Knowledge map ready.'")
    expect(graphPage).not.toContain('Building the map')
    expect(mapSource).not.toContain('function MapSkeleton')
  })
})
