import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import type { PanZoomControls } from '../../hooks/usePanZoom'
import type { LayoutMode } from '../../hooks/layouts/types'
import { GRAPH_NODE_INK } from './GraphNode'
import { computePositionBounds } from './graphViewModel'

type SvgSize = { width: number; height: number }
type PositionMap = Map<string, { x: number; y: number }>

export function graphViewportFitKey({
  mode,
  svgSize,
  entityCount,
  relationshipCount,
}: {
  mode: LayoutMode
  svgSize: SvgSize
  entityCount: number
  relationshipCount: number
}): string | null {
  if (mode === 'organic') return null
  if (svgSize.width < 120 || svgSize.height < 120) return null
  return `${mode}:${entityCount}:${relationshipCount}:${Math.round(
    svgSize.width,
  )}x${Math.round(svgSize.height)}`
}

export function useGraphSvgMeasure(svgRef: MutableRefObject<SVGSVGElement | null>) {
  const [svgElement, setSvgElement] = useState<SVGSVGElement | null>(null)
  const [svgSize, setSvgSize] = useState<SvgSize>({ width: 0, height: 0 })
  const setGraphSvgRef = useCallback(
    (node: SVGSVGElement | null) => {
      svgRef.current = node
      setSvgElement(node)
    },
    [svgRef],
  )

  useLayoutEffect(() => {
    const svg = svgElement
    if (!svg) return
    let frame = 0
    const update = () => {
      const rect = svg.getBoundingClientRect()
      setSvgSize((prev) => {
        if (
          Math.round(prev.width) === Math.round(rect.width) &&
          Math.round(prev.height) === Math.round(rect.height)
        ) {
          return prev
        }
        return { width: rect.width, height: rect.height }
      })
    }
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(update)
    }
    update()
    frame = window.requestAnimationFrame(update)
    const observer = new ResizeObserver(scheduleUpdate)
    observer.observe(svg)
    window.addEventListener('resize', scheduleUpdate)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [svgElement])

  return { svgSize, setGraphSvgRef }
}

/** Techo de zoom al encuadrar. Exportado para que el test lo afirme. */
export const FIT_MAX_ZOOM = 2

/**
 * La caja contra la que se encuadra: los centros MÁS la tinta que cada nodo
 * pinta a su alrededor.
 *
 * Vive acá, y no en el cuerpo del efecto, para que la sonda pueda afirmar la
 * decisión en vez de reimplementarla: cuando el test llamaba por su cuenta a
 * `computePositionBounds(pos, GRAPH_NODE_INK)`, quitar la tinta del sitio de
 * producción no rompía nada. Una sola fuente, y la mutación cae.
 */
export function graphFitBounds(
  positions: PositionMap | ReadonlyMap<string, { x: number; y: number }>,
) {
  return computePositionBounds(positions, GRAPH_NODE_INK)
}

export function useGraphViewportFit({
  mode,
  svgSize,
  entityCount,
  relationshipCount,
  positions,
  panZoom,
}: {
  mode: LayoutMode
  svgSize: SvgSize
  entityCount: number
  relationshipCount: number
  positions: PositionMap
  panZoom: Pick<PanZoomControls, 'fitToView'>
}) {
  const lastFittedViewportRef = useRef<string | null>(null)

  useEffect(() => {
    if (mode === 'organic') {
      lastFittedViewportRef.current = mode
      return
    }
    const fitKey = graphViewportFitKey({
      mode,
      svgSize,
      entityCount,
      relationshipCount,
    })
    if (!fitKey) return
    if (lastFittedViewportRef.current === fitKey) return
    const bounds = graphFitBounds(positions)
    if (!bounds) return
    // El techo era 1.15 y dejaba los grafos chicos como un racimo perdido:
    // medido con el seed de prueba, seis nodos ocupaban 360×336 sobre un
    // lienzo de 1184×851, el 12 % del área, idéntico a 1440×900 y a 1280×720
    // (el encuadre recentraba pero no reescalaba). Con la caja ya inflada por
    // la tinta, 2 deja ese caso en ~62 % del ancho y ~76 % del alto. Para
    // grafos grandes el techo es indiferente: ahí `fitScale` cae por debajo
    // incluso del piso, y `Math.max`/`Math.min` lo eligen igual.
    panZoom.fitToView(bounds, 140, FIT_MAX_ZOOM)
    lastFittedViewportRef.current = fitKey
  }, [mode, positions, panZoom, svgSize, entityCount, relationshipCount])
}
