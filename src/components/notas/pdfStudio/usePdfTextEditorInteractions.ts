import {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import {
  screenDeltaToPage,
  type PageLayout,
  type ResizeHandle,
} from '../../../lib/pdfStudio/editorGeometry'
import type { History } from '../../../lib/pdfStudio/history'
import {
  cloneAnnotation,
  translateAnnotation,
  type Annotation,
  type HighlightAnnotation,
  type ImageAnnotation,
  type ShapeAnnotation,
  type TextAnnotation,
} from '../../../lib/pdfStudio/model'
import type { DrawingRect } from './AnnotationLayer'
import { createAnnotationFromDrawGesture } from './pdfAnnotationDrawing'
import { resizeAnnotationFromPointerDelta } from './pdfAnnotationResize'
import { snapAnnotationDrag, type SnapGuide } from './pdfAnnotationSnap'
import {
  HIGHLIGHT_OPACITY,
  SHAPE_STROKE,
  clamp,
  type TextStyle,
  type Tool,
} from './editorStyle'

const TEXT_SIZE_MIN = 0.012
const TEXT_SIZE_MAX = 0.14

export function usePdfTextEditorInteractions({
  layout,
  zoom,
  tool,
  style,
  editedRef,
  annotationsRef,
  setSelectedId,
  setDrawing,
  setSnapGuides,
  setHistory,
  setAnnotations,
  editLive,
}: {
  layout: PageLayout | null
  zoom: number
  tool: Tool
  style: TextStyle
  editedRef: { current: Record<number, Annotation[]> }
  annotationsRef: { current: Annotation[] }
  setSelectedId: (id: string | null) => void
  setDrawing: Dispatch<SetStateAction<DrawingRect | null>>
  setSnapGuides: Dispatch<SetStateAction<SnapGuide[]>>
  setHistory: Dispatch<SetStateAction<History<Record<number, Annotation[]>>>>
  setAnnotations: (fn: (list: Annotation[]) => Annotation[]) => void
  editLive: (fn: (list: Annotation[]) => Annotation[]) => void
}) {
  function startDrag(e: ReactPointerEvent, a: Annotation) {
    e.stopPropagation()
    if (a.locked) return
    const dw = (layout?.innerW ?? 1) * zoom
    const dh = (layout?.innerH ?? 1) * zoom
    const rot = layout?.rot ?? 0
    const startX = e.clientX
    const startY = e.clientY
    const duplicateDrag = e.altKey
    const orig = duplicateDrag ? cloneAnnotation(a) : a
    setSelectedId(orig.id)
    const before = editedRef.current
    if (duplicateDrag) {
      editLive((list) => [...list, orig])
    }
    let moved = false
    const move = (ev: PointerEvent) => {
      const { dx: pdx, dy: pdy } = screenDeltaToPage(
        ev.clientX - startX,
        ev.clientY - startY,
        rot,
      )
      moved = true
      const snapped = snapAnnotationDrag({
        annotation: orig,
        annotations: [...annotationsRef.current.filter((ann) => ann.id !== a.id), orig],
        dxRatio: pdx / dw,
        dyRatio: pdy / dh,
        pageWidthPx: dw,
        pageHeightPx: dh,
      })
      setSnapGuides(snapped.guides)
      const next = translateAnnotation(orig, snapped.dxRatio, snapped.dyRatio)
      editLive((list) =>
        list.some((x) => x.id === orig.id)
          ? list.map((x) => (x.id === orig.id ? next : x))
          : [...list, next],
      )
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setSnapGuides([])
      if (moved)
        setHistory((h) => ({ past: [...h.past, before], present: h.present, future: [] }))
      else if (duplicateDrag) {
        setSelectedId(a.id)
        setHistory((h) => ({ ...h, present: before }))
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startResize(
    e: ReactPointerEvent,
    a: TextAnnotation | HighlightAnnotation | ImageAnnotation | ShapeAnnotation,
    handle: ResizeHandle,
  ) {
    if (!layout) return
    e.stopPropagation()
    e.preventDefault()
    if (a.locked) return
    setSelectedId(a.id)
    const dw = layout.innerW * zoom
    const dh = layout.innerH * zoom
    const rot = layout.rot
    const startX = e.clientX
    const startY = e.clientY
    const before = editedRef.current
    let resized = false
    const move = (ev: PointerEvent) => {
      resized = true
      const next = resizeAnnotationFromPointerDelta(a, handle, {
        screenDx: ev.clientX - startX,
        screenDy: ev.clientY - startY,
        pageWidthPx: dw,
        pageHeightPx: dh,
        rotationQuarters: rot,
        minTextSizeRatio: TEXT_SIZE_MIN,
        maxTextSizeRatio: TEXT_SIZE_MAX,
        minBoxWidthRatio: 14 / dw,
        minBoxHeightRatio: 14 / dh,
        lockAspectRatio: a.kind === 'image' && ev.shiftKey,
      })
      editLive((list) => list.map((x) => (x.id === a.id ? next : x)))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (resized)
        setHistory((h) => ({ past: [...h.past, before], present: h.present, future: [] }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function startDraw(e: ReactPointerEvent) {
    if (!layout) return
    e.stopPropagation()
    const drawTool = tool
    const x0 = e.nativeEvent.offsetX
    const y0 = e.nativeEvent.offsetY
    const startX = e.clientX
    const startY = e.clientY
    const rot = layout.rot
    const innerW = layout.innerW
    const innerH = layout.innerH
    let last = { x0, y0, x1: x0, y1: y0 }
    setDrawing(last)
    const move = (ev: PointerEvent) => {
      const { dx: pdx, dy: pdy } = screenDeltaToPage(
        ev.clientX - startX,
        ev.clientY - startY,
        rot,
      )
      last = {
        x0,
        y0,
        x1: clamp(x0 + pdx / zoom, 0, innerW),
        y1: clamp(y0 + pdy / zoom, 0, innerH),
      }
      setDrawing(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrawing(null)
      const annotation = createAnnotationFromDrawGesture({
        tool: drawTool,
        x0: last.x0,
        y0: last.y0,
        x1: last.x1,
        y1: last.y1,
        pageWidthPx: innerW,
        pageHeightPx: innerH,
        style: {
          color: style.color,
          strokeRatio: SHAPE_STROKE,
          highlightOpacity: HIGHLIGHT_OPACITY,
        },
      })
      if (!annotation) return
      setAnnotations((list) => [...list, annotation])
      setSelectedId(annotation.id)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return { startDrag, startResize, startDraw }
}
