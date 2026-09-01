import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type GroupStyle,
  type Insets,
  KnowledgeMap,
  type MapEdge,
  type MapLayout,
  type MapMeasure,
  type MapNode,
} from './KnowledgeMap.tsx'
import { type EngineData, KnowledgeMapEngine, webglAvailable } from './map3d-engine.ts'

// ---------------------------------------------------------------------------
// The knowledge map in three dimensions.
//
// This is the React shell around map3d-engine.ts: it filters the graph to
// what the legend and switches leave visible, hands the engine its data,
// emphasis and panel insets, and carries selections back out. The page
// around it (GraphPage) is unchanged - same navigator, same detail dock,
// same path tracing - because this component keeps the 2D map's exact
// contract. Where WebGL is unavailable the 2D canvas steps back in, so the
// map never renders as a black rectangle.
// ---------------------------------------------------------------------------

export function KnowledgeMap3D({
  nodes,
  edges,
  groupStyles,
  degrees,
  measure,
  layout,
  hiddenGroups,
  hideUnlinked,
  selectedId,
  pathEdges,
  pathFrom,
  onSelect,
  focusId,
  insets,
  hint,
}: {
  nodes: MapNode[]
  edges: MapEdge[]
  groupStyles: Map<string, GroupStyle>
  degrees: Map<string, number>
  measure: MapMeasure
  layout: MapLayout
  hiddenGroups: Set<string>
  hideUnlinked: boolean
  selectedId: string | null
  pathEdges: MapEdge[] | null
  pathFrom: string | null
  onSelect: (id: string | null) => void
  focusId: string | null
  /** Measured by the page from the floating panels - see GraphPage. */
  insets: Insets
  hint: string
}) {
  const [supported] = useState(webglAvailable)

  const visibleNodes = useMemo(
    () =>
      nodes.filter((n) =>
        !hiddenGroups.has(n.group) && !(hideUnlinked && (degrees.get(n.id) ?? 0) === 0)
      ),
    [nodes, hiddenGroups, hideUnlinked, degrees],
  )
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])
  const visibleEdges = useMemo(
    () => edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [edges, visibleIds],
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const labelsRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<KnowledgeMapEngine | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      setSize((prev) =>
        prev.w === rect.width && prev.h === rect.height ? prev : { w: rect.width, h: rect.height }
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Coarse buckets only, as in 2D: the cluster ring follows the viewport
  // shape but must not re-run the layout on every pixel of a window drag.
  const aspectBucket = size.w < 1 || size.h < 1
    ? 1.5
    : size.w / size.h < 1
    ? 0.8
    : size.w / size.h < 1.45
    ? 1.2
    : 1.9

  // A lost WebGL context leaves a frozen canvas; the 2D map takes over.
  const [contextLost, setContextLost] = useState(false)
  const usable = supported && !contextLost

  // Mirrors the 2D map's fit signature: the view is re-framed when the
  // visible set or the layout changes shape, never merely because the
  // emphasis did.
  const fitSigRef = useRef('')

  // One engine for the component's life.
  useEffect(() => {
    if (!usable) return
    const canvas = canvasRef.current
    const labels = labelsRef.current
    if (!canvas || !labels) return
    // A fresh engine knows nothing, so the fit signature must forget too -
    // otherwise a remount (StrictMode, or recovery) skips the initial fit.
    fitSigRef.current = ''
    const engine = new KnowledgeMapEngine(
      canvas,
      labels,
      (id) => onSelectRef.current(id),
      () => setContextLost(true),
    )
    engineRef.current = engine
    return () => {
      engineRef.current = null
      engine.dispose()
    }
  }, [usable])

  // Data - and the fit that frames it.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const data: EngineData = {
      nodes: visibleNodes,
      edges: visibleEdges,
      groupStyles,
      degrees,
      measure,
      layout,
      aspect: aspectBucket,
    }
    engine.setData(data)
    const sig = `${layout}|${aspectBucket}|${visibleNodes.map((n) => n.id).join('|')}`
    if (sig !== fitSigRef.current) {
      fitSigRef.current = sig
      engine.fit(false)
    }
  }, [visibleNodes, visibleEdges, groupStyles, degrees, measure, layout, aspectBucket])

  useEffect(() => {
    engineRef.current?.setEmphasis({ selectedId, pathEdges, pathFrom })
  }, [selectedId, pathEdges, pathFrom])

  // An explicit request to bring a node into view - counted rather than read
  // directly, so asking twice for the same node moves the view twice.
  const [focusPulse, setFocusPulse] = useState(0)
  useEffect(() => {
    if (focusId) setFocusPulse((n) => n + 1)
  }, [focusId])

  const focusServicedRef = useRef<
    { id: string; pulse: number; box: Insets; dist: number | null } | null
  >(null)
  const lastInsetsRef = useRef<Insets | null>(null)

  // Bring the selection into the space the panels leave free, and hand the
  // space back when they go - the same protocol as the 2D map: the panels
  // are measured after they mount, so the first pass at a new selection can
  // run against a stale box and the second pass re-centres in the real one,
  // keeping the camera distance the first pass chose.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setInsets(insets)
    const previous = lastInsetsRef.current
    lastInsetsRef.current = insets
    const id = focusId ?? selectedId
    if (id) {
      const done = focusServicedRef.current
      const following = done !== null && done.id === id && done.pulse === focusPulse
      if (
        following && done.box.left === insets.left && done.box.right === insets.right &&
        done.box.bottom === insets.bottom
      ) return
      const dist = engine.focusOn(id, following ? done.dist : null)
      focusServicedRef.current = { id, pulse: focusPulse, box: insets, dist }
      return
    }
    focusServicedRef.current = null
    if (!previous || !engine.focusOwned) return
    const dx = ((insets.left - previous.left) - (insets.right - previous.right)) / 2
    const dy = -(insets.bottom - previous.bottom) / 2
    engine.nudgeForInsets(dx, dy)
  }, [focusId, selectedId, focusPulse, insets])

  if (!usable) {
    return (
      <KnowledgeMap
        nodes={nodes}
        edges={edges}
        groupStyles={groupStyles}
        degrees={degrees}
        measure={measure}
        layout={layout}
        hiddenGroups={hiddenGroups}
        hideUnlinked={hideUnlinked}
        selectedId={selectedId}
        pathEdges={pathEdges}
        pathFrom={pathFrom}
        onSelect={onSelect}
        focusId={focusId}
        insets={insets}
        hint='Drag to pan · scroll to zoom · click a node to explore it'
      />
    )
  }

  return (
    <div ref={containerRef} className='rp-map3d absolute inset-0'>
      <canvas
        ref={canvasRef}
        role='application'
        aria-label='Knowledge map - drag to orbit, pinch or scroll to zoom, click a node to explore it. With the keyboard: arrows orbit, plus and minus zoom, Enter selects the entity nearest the middle. The navigator list and the find field reach any entity by name.'
        tabIndex={0}
        className='rp-focus block h-full w-full cursor-grab touch-none select-none'
      />
      {/* The vignette sits beneath the type, as it does on the 2D map. */}
      <div className='rp-map3d-vignette' aria-hidden='true' />
      <div ref={labelsRef} className='rp-map3d-labels' aria-hidden='true' />

      <p className='pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 text-xs text-ink-3 lg:block'>
        {hint}
      </p>

      {
        /* Zoom controls. A panel that covers the bottom of the canvas would
          bury them, so they ride above it - and lie down into a row while
          they are there. The row form reorders the DOM rather than using
          flex-row-reverse, so the tab order always follows the visual one. */
      }
      <div
        className={`absolute right-4 flex gap-1 ${insets.bottom > 0 ? 'flex-row' : 'flex-col'}`}
        style={{ bottom: insets.bottom + 16 }}
      >
        {(() => {
          const zoomIn = (
            <button
              key='in'
              type='button'
              aria-label='Zoom in'
              onClick={() => engineRef.current?.zoomBy(1.3)}
              className='rp-btn rp-btn-outline rp-shadow-sm h-9 w-9 p-0 text-lg'
            >
              +
            </button>
          )
          const zoomOut = (
            <button
              key='out'
              type='button'
              aria-label='Zoom out'
              onClick={() => engineRef.current?.zoomBy(1 / 1.3)}
              className='rp-btn rp-btn-outline rp-shadow-sm h-9 w-9 p-0 text-lg'
            >
              −
            </button>
          )
          const fit = (
            <button
              key='fit'
              type='button'
              aria-label='Fit the whole map to view'
              title='Fit to view'
              onClick={() => engineRef.current?.fit(true)}
              className='rp-btn rp-btn-outline rp-shadow-sm h-9 w-9 p-0 text-sm'
            >
              ⤢
            </button>
          )
          return insets.bottom > 0 ? [fit, zoomOut, zoomIn] : [zoomIn, zoomOut, fit]
        })()}
      </div>
    </div>
  )
}
