import type {
  HighlightAnnotation,
  ImageAnnotation,
  ShapeAnnotation,
  TextAnnotation,
} from '../../../lib/pdfStudio/model'
import {
  resizeRatioBox,
  screenDeltaToPage,
  type ResizeHandle,
} from '../../../lib/pdfStudio/editorGeometry'
import { clamp } from './editorStyle'

export type ResizableAnnotation =
  | TextAnnotation
  | HighlightAnnotation
  | ImageAnnotation
  | ShapeAnnotation

export type AnnotationResizePointerDelta = {
  screenDx: number
  screenDy: number
  pageWidthPx: number
  pageHeightPx: number
  rotationQuarters: number
  minTextSizeRatio?: number
  maxTextSizeRatio?: number
  minBoxWidthRatio?: number
  minBoxHeightRatio?: number
}

export function resizeAnnotationFromPointerDelta<T extends ResizableAnnotation>(
  annotation: T,
  handle: ResizeHandle,
  delta: AnnotationResizePointerDelta,
): T {
  const pageWidthPx = Math.max(1, delta.pageWidthPx)
  const pageHeightPx = Math.max(1, delta.pageHeightPx)
  const { dx, dy } = screenDeltaToPage(
    delta.screenDx,
    delta.screenDy,
    delta.rotationQuarters,
  )
  const dxRatio = dx / pageWidthPx
  const dyRatio = dy / pageHeightPx

  if (annotation.kind === 'text') {
    const sx = handle.includes('w') ? -dxRatio : dxRatio
    const sy = handle.includes('n') ? -dyRatio : dyRatio
    return {
      ...annotation,
      sizeRatio: clamp(
        annotation.sizeRatio + Math.max(sx, sy),
        delta.minTextSizeRatio ?? 0.012,
        delta.maxTextSizeRatio ?? 0.14,
      ),
    }
  }

  if (annotation.kind === 'shape') {
    const left = Math.min(annotation.x0Ratio, annotation.x1Ratio)
    const top = Math.min(annotation.y0Ratio, annotation.y1Ratio)
    const box = resizeRatioBox(
      {
        xRatio: left,
        yRatio: top,
        wRatio: Math.abs(annotation.x1Ratio - annotation.x0Ratio),
        hRatio: Math.abs(annotation.y1Ratio - annotation.y0Ratio),
      },
      handle,
      dxRatio,
      dyRatio,
      {
        minW: delta.minBoxWidthRatio,
        minH: delta.minBoxHeightRatio,
      },
    )
    const right = box.xRatio + box.wRatio
    const bottom = box.yRatio + box.hRatio
    const x0Ratio = annotation.x0Ratio <= annotation.x1Ratio ? box.xRatio : right
    const x1Ratio = annotation.x0Ratio <= annotation.x1Ratio ? right : box.xRatio
    const y0Ratio = annotation.y0Ratio <= annotation.y1Ratio ? box.yRatio : bottom
    const y1Ratio = annotation.y0Ratio <= annotation.y1Ratio ? bottom : box.yRatio
    return { ...annotation, x0Ratio, y0Ratio, x1Ratio, y1Ratio }
  }

  return {
    ...annotation,
    ...resizeRatioBox(annotation, handle, dxRatio, dyRatio, {
      minW: delta.minBoxWidthRatio,
      minH: delta.minBoxHeightRatio,
    }),
  }
}
