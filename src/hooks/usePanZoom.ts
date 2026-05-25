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
  /** Resetea al zoom default y pan a (0,0) — botón "centrar vista". */
  resetView: () => void
  /** π2: set pan a una coordenada world específica. Usado por el minimap
      para centrar el viewport en un punto cuando el usuario clickea. */
  setPanTo: (worldX: number, worldY: number) => void
  /** ρ-fix: encuadra el viewport a un bounding box. Calcula zoom + pan
      necesarios para que el bbox entre en la vista con `padding` píxeles
      de margen. Se llama al cambiar de layout mode (especialmente by-type
      / by-year, que colocan nodos lejos del centro y sin esto se ven
      como "telaraña sin nodos"). */
  fitToView: (
    bbox: { minX: number; minY: number; maxX: number; maxY: number },
    padding?: number,
  ) => void
}

/**
 * Drag-to-pan + wheel-to-zoom interactions for an SVG canvas.
 *
 * Caller wires these onto the outer <svg>. Inner content should be wrapped in
 * <g transform={`translate(50% 50%) scale(${zoom}) translate(${pan.x} ${pan.y})`}>.
 */
export function usePanZoom(
  svgRef: React.RefObject<SVGSVGElement | null>,
  options?: { minZoom?: number; maxZoom?: number; defaultZoom?: number },
): PanZoomState & PanZoomControls & {
  isDragging: () => boolean
  startDrag: (id: string, offset: { x: number; y: number }) => void
  cancelDrag: () => void
  draggingId: () => string | null
} {
  // Default zoom = 0.7 (ρ-struct): el grafo se siente menos apretado al
  // entrar; el usuario puede subir con wheel o con el botón [+] cuando
  // quiera detalle.
  const defaultZoom = options?.defaultZoom ?? 0.7
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(defaultZoom)
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
  // Reset view — vuelve a zoom default y pan (0,0). Centra el grafo de
  // nuevo. Útil después de navegar lejos en el canvas.
  const resetView = useCallback(() => {
    setZoom(defaultZoom)
    setPan({ x: 0, y: 0 })
  }, [defaultZoom])

  // π2: centra el viewport en (worldX, worldY). El sistema usa
  // translate(50%, 50%) scale(zoom) translate(pan.x, pan.y), así que para
  // poner el punto (worldX, worldY) en el centro visual basta con
  // pan = -worldXY. (Conserva el zoom actual.)
  const setPanTo = useCallback((worldX: number, worldY: number) => {
    setPan({ x: -worldX, y: -worldY })
  }, [])

  // ρ-fix: encuadra el viewport en un bbox. Resuelve el caso del layout
  // `by-type` (B1) — los nodos van a ±(120·N) y a zoom 1 quedan fuera
  // del viewport, dejando solo edges visibles. Ahora calculamos el zoom
  // óptimo para que el bbox entre con `padding` px de margen.
  const fitToView = useCallback(
    (
      bbox: { minX: number; minY: number; maxX: number; maxY: number },
      padding = 80,
    ) => {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const bboxW = Math.max(1, bbox.maxX - bbox.minX)
      const bboxH = Math.max(1, bbox.maxY - bbox.minY)
      const cx = (bbox.minX + bbox.maxX) / 2
      const cy = (bbox.minY + bbox.maxY) / 2
      const scaleX = (width - padding * 2) / bboxW
      const scaleY = (height - padding * 2) / bboxH
      const fitScale = Math.min(scaleX, scaleY)
      setZoom(Math.max(minZoom, Math.min(maxZoom, fitScale)))
      // pan = -centro del bbox (porque la SVG group hace
      // translate(50%, 50%) scale(zoom) translate(pan)).
      setPan({ x: -cx, y: -cy })
    },
    [svgRef, minZoom, maxZoom],
  )

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
    setPanTo,
    fitToView,
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
