import type {
  HighlightAnnotation,
  ImageAnnotation,
  RedactionAnnotation,
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
  | RedactionAnnotation
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
  lockAspectRatio?: boolean
}

function resizeImageWithLockedAspectRatio(
  annotation: ImageAnnotation,
  box: { xRatio: number; yRatio: number; wRatio: number; hRatio: number },
  handle: ResizeHandle,
  pageWidthPx: number,
  pageHeightPx: number,
): ImageAnnotation {
  const aspect = (annotation.wRatio * pageWidthPx) / (annotation.hRatio * pageHeightPx)
  if (!Number.isFinite(aspect) || aspect <= 0) return { ...annotation, ...box }

  const widthDeltaPx = Math.abs((box.wRatio - annotation.wRatio) * pageWidthPx)
  const heightDeltaPx = Math.abs((box.hRatio - annotation.hRatio) * pageHeightPx)
  let wRatio = box.wRatio
  let hRatio = box.hRatio

  if (widthDeltaPx >= heightDeltaPx) {
    hRatio = (wRatio * pageWidthPx) / (aspect * pageHeightPx)
  } else {
    wRatio = (hRatio * pageHeightPx * aspect) / pageWidthPx
  }

  const right = annotation.xRatio + annotation.wRatio
  const bottom = annotation.yRatio + annotation.hRatio
  const xRatio = handle.includes('w') ? right - wRatio : box.xRatio
  const yRatio = handle.includes('n') ? bottom - hRatio : box.yRatio
  return { ...annotation, xRatio, yRatio, wRatio, hRatio }
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
    if (typeof annotation.wRatio === 'number' && typeof annotation.hRatio === 'number') {
      return {
        ...annotation,
        ...resizeRatioBox(
          {
            xRatio: annotation.xRatio,
            yRatio: annotation.yRatio,
            wRatio: annotation.wRatio,
            hRatio: annotation.hRatio,
          },
          handle,
          dxRatio,
          dyRatio,
          {
            minW: delta.minBoxWidthRatio,
            minH: delta.minBoxHeightRatio,
          },
        ),
      }
    }
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

  const box = resizeRatioBox(annotation, handle, dxRatio, dyRatio, {
    minW: delta.minBoxWidthRatio,
    minH: delta.minBoxHeightRatio,
  })

  if (annotation.kind === 'image' && delta.lockAspectRatio) {
    return resizeImageWithLockedAspectRatio(
      annotation,
      box,
      handle,
      pageWidthPx,
      pageHeightPx,
    ) as T
  }

  return { ...annotation, ...box }
}
