import type {
  HighlightAnnotation,
  ImageAnnotation,
  TextAnnotation,
} from '../../../lib/pdfStudio/model'
import {
  resizeRatioBox,
  screenDeltaToPage,
  type ResizeHandle,
} from '../../../lib/pdfStudio/editorGeometry'
import { clamp } from './editorStyle'

export type ResizableAnnotation = TextAnnotation | HighlightAnnotation | ImageAnnotation

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

  return {
    ...annotation,
    ...resizeRatioBox(annotation, handle, dxRatio, dyRatio, {
      minW: delta.minBoxWidthRatio,
      minH: delta.minBoxHeightRatio,
    }),
  }
}
