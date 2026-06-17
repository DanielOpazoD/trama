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
    const bounds = computePositionBounds(positions)
    if (!bounds) return
    panZoom.fitToView(bounds, 140, 1.15)
    lastFittedViewportRef.current = fitKey
  }, [mode, positions, panZoom, svgSize, entityCount, relationshipCount])
}
