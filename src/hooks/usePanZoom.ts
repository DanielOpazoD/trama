import { useCallback, useRef, useState } from 'react'

type Pan = { x: number; y: number }

export type PanZoomState = {
  pan: Pan
  zoom: number
  isPanning: boolean
}

export type PanZoomControls = {
  onMouseDown: (event: React.MouseEvent) => void
  onMouseMove: (event: React.MouseEvent) => void
  onMouseUp: () => void
  onWheel: (event: React.WheelEvent) => void
  /** Convert a screen-space point to canvas-world coords (origin at the SVG center). */
  screenToWorld: (clientX: number, clientY: number) => { x: number; y: number }
  /** Programmatic zoom in — usado por botón [+] del toolbar. */
  zoomIn: () => void
  /** Programmatic zoom out — usado por botón [−] del toolbar. */
  zoomOut: () => void
  /** Resetea zoom a 1 y pan a (0,0) — botón "centrar vista". */
  resetView: () => void
}

/**
 * Drag-to-pan + wheel-to-zoom interactions for an SVG canvas.
 *
 * Caller wires these onto the outer <svg>. Inner content should be wrapped in
 * <g transform={`translate(50% 50%) scale(${zoom}) translate(${pan.x} ${pan.y})`}>.
 */
export function usePanZoom(
  svgRef: React.RefObject<SVGSVGElement | null>,
  options?: { minZoom?: number; maxZoom?: number },
): PanZoomState & PanZoomControls & {
  isDragging: () => boolean
  startDrag: (id: string, offset: { x: number; y: number }) => void
  cancelDrag: () => void
  draggingId: () => string | null
} {
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const dragging = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)

  const minZoom = options?.minZoom ?? 0.25
  const maxZoom = options?.maxZoom ?? 2.5

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return { x: 0, y: 0 }
      const rect = svg.getBoundingClientRect()
      const localX = clientX - rect.left - rect.width / 2
      const localY = clientY - rect.top - rect.height / 2
      return { x: localX / zoom - pan.x, y: localY / zoom - pan.y }
    },
    [svgRef, zoom, pan],
  )

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      panStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
      setIsPanning(true)
    },
    [pan],
  )

  const onMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!dragging.current && panStart.current) {
        const dx = event.clientX - panStart.current.x
        const dy = event.clientY - panStart.current.y
        setPan({
          x: panStart.current.panX + dx / zoom,
          y: panStart.current.panY + dy / zoom,
        })
      }
    },
    [zoom],
  )

  const onMouseUp = useCallback(() => {
    panStart.current = null
    setIsPanning(false)
  }, [])

  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY > 0 ? 0.92 : 1.08
      setZoom((z) => Math.max(minZoom, Math.min(maxZoom, z * delta)))
    },
    [minZoom, maxZoom],
  )

  // Zoom programático — usado por los botones [+] / [−] del toolbar.
  // Reusan la misma escala 0.92 / 1.08 que el wheel para que un click
  // sienta como un "tick" de scroll. clampean a min/maxZoom.
  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(maxZoom, z * 1.18))
  }, [maxZoom])
  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(minZoom, z * 0.85))
  }, [minZoom])
  // Reset view — vuelve a zoom 1 y pan (0,0). Centra el grafo de nuevo.
  // Útil después de navegar lejos en el canvas.
  const resetView = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  return {
    pan,
    zoom,
    isPanning,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel,
    screenToWorld,
    zoomIn,
    zoomOut,
    resetView,
    isDragging: () => dragging.current !== null,
    startDrag: (id, offset) => {
      dragging.current = { id, offsetX: offset.x, offsetY: offset.y }
    },
    cancelDrag: () => {
      dragging.current = null
    },
    draggingId: () => dragging.current?.id ?? null,
  }
}
