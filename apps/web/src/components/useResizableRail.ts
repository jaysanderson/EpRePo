import { useCallback, useEffect, useRef, useState } from 'react'

const MIN = 300
const MAX = 720
const DEFAULT = 368
const STORAGE_KEY = 'rp-rail-width'
/** Wide enough to read an answer in without hiding the document. */
const REVEAL = 520

function clamp(width: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(width)))
}

/**
 * A draggable split between the document and its rail. The width persists per
 * reader, and the rail can be widened programmatically (when someone starts
 * asking the document a question) with an eased transition that is suppressed
 * while dragging - a transition during a drag lags the pointer.
 */
export function useResizableRail() {
  const [width, setWidth] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY))
      return Number.isFinite(stored) && stored > 0 ? clamp(stored) : DEFAULT
    } catch {
      return DEFAULT
    }
  })
  const [dragging, setDragging] = useState(false)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(width))
    } catch {
      // A reader with storage blocked simply does not keep the width.
    }
  }, [width])

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    setDragging(true)

    const move = (moveEvent: PointerEvent) => {
      // The rail is on the right, so its width is the distance from the
      // pointer to the right edge of the viewport.
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        setWidth(clamp(globalThis.innerWidth - moveEvent.clientX))
      })
    }
    const up = () => {
      setDragging(false)
      handle.releasePointerCapture(event.pointerId)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
  }, [])

  /** Keyboard parity for the drag - a splitter must not be pointer-only. */
  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setWidth((w) => clamp(w + step))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setWidth((w) => clamp(w - step))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setWidth(DEFAULT)
    }
  }, [])

  const reveal = useCallback(() => setWidth((w) => (w >= REVEAL ? w : REVEAL)), [])

  return { width, dragging, onPointerDown, onKeyDown, reveal, min: MIN, max: MAX }
}
