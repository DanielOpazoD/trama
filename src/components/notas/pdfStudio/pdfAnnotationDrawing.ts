import {
  makeHighlightAnnotation,
  makeShapeAnnotation,
  type Annotation,
  type ShapeKind,
} from '../../../lib/pdfStudio/model'
import { rectFromPoints } from '../../../lib/pdfStudio/editorGeometry'
import { isShapeTool, type Tool } from './editorStyle'

const MIN_DRAW_DISTANCE_PX = 4
const MIN_BOX_SIDE_PX = 4

export type DrawGestureStyle = {
  color: string
  strokeRatio: number
  highlightOpacity: number
}

export type DrawGestureInput = {
  tool: Tool
  x0: number
  y0: number
  x1: number
  y1: number
  pageWidthPx: number
  pageHeightPx: number
  style: DrawGestureStyle
}

export function createAnnotationFromDrawGesture(
  input: DrawGestureInput,
): Annotation | null {
  const pageWidthPx = Math.max(1, input.pageWidthPx)
  const pageHeightPx = Math.max(1, input.pageHeightPx)
  if (Math.hypot(input.x1 - input.x0, input.y1 - input.y0) < MIN_DRAW_DISTANCE_PX) {
    return null
  }

  if (input.tool === 'highlight') {
    const rect = rectFromPoints(input.x0, input.y0, input.x1, input.y1)
    if (rect.w < MIN_BOX_SIDE_PX || rect.h < MIN_BOX_SIDE_PX) return null
    return makeHighlightAnnotation({
      xRatio: rect.x / pageWidthPx,
      yRatio: rect.y / pageHeightPx,
      wRatio: rect.w / pageWidthPx,
      hRatio: rect.h / pageHeightPx,
      color: input.style.color,
      opacity: input.style.highlightOpacity,
    })
  }

  if (!isShapeTool(input.tool)) return null

  return makeShapeAnnotation({
    shape: input.tool as ShapeKind,
    x0Ratio: input.x0 / pageWidthPx,
    y0Ratio: input.y0 / pageHeightPx,
    x1Ratio: input.x1 / pageWidthPx,
    y1Ratio: input.y1 / pageHeightPx,
    color: input.style.color,
    strokeRatio: input.style.strokeRatio,
  })
}
