import {
  TEXT_LINE_HEIGHT,
  type Annotation,
  type HighlightAnnotation,
  type ImageAnnotation,
  type TextAnnotation,
} from '../../../../lib/pdfStudio/model/model'

export type SnapGuide = { axis: 'x' | 'y'; ratio: number }

type AnnotationBox = {
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

function textBox(
  annotation: TextAnnotation,
  pageWidthPx: number,
  pageHeightPx: number,
): AnnotationBox {
  const fontPx = annotation.sizeRatio * pageHeightPx
  return {
    xRatio: annotation.xRatio,
    yRatio: annotation.yRatio,
    wRatio:
      annotation.wRatio ??
      Math.max(fontPx * 1.6, (annotation.text || ' ').length * fontPx * 0.55) /
        Math.max(1, pageWidthPx),
    hRatio: annotation.hRatio ?? (fontPx * TEXT_LINE_HEIGHT) / Math.max(1, pageHeightPx),
  }
}

function annotationBox(
  annotation: Annotation,
  pageWidthPx: number,
  pageHeightPx: number,
): AnnotationBox {
  if (annotation.kind === 'text') return textBox(annotation, pageWidthPx, pageHeightPx)
  if (annotation.kind === 'shape') {
    return {
      xRatio: Math.min(annotation.x0Ratio, annotation.x1Ratio),
      yRatio: Math.min(annotation.y0Ratio, annotation.y1Ratio),
      wRatio: Math.abs(annotation.x1Ratio - annotation.x0Ratio),
      hRatio: Math.abs(annotation.y1Ratio - annotation.y0Ratio),
    }
  }
  return annotation as HighlightAnnotation | ImageAnnotation
}

function anchors(box: AnnotationBox): { x: number[]; y: number[] } {
  return {
    x: [box.xRatio, box.xRatio + box.wRatio / 2, box.xRatio + box.wRatio],
    y: [box.yRatio, box.yRatio + box.hRatio / 2, box.yRatio + box.hRatio],
  }
}

function nearestSnap(
  movingAnchors: number[],
  targets: number[],
  thresholdRatio: number,
): { adjustRatio: number; guideRatio: number } | null {
  let best: { adjustRatio: number; guideRatio: number; distance: number } | null = null
  for (const moving of movingAnchors) {
    for (const target of targets) {
      const adjustRatio = target - moving
      const distance = Math.abs(adjustRatio)
      if (distance > thresholdRatio) continue
      if (!best || distance < best.distance) {
        best = { adjustRatio, guideRatio: target, distance }
      }
    }
  }
  return best ? { adjustRatio: best.adjustRatio, guideRatio: best.guideRatio } : null
}

export function snapAnnotationDrag({
  annotation,
  annotations,
  dxRatio,
  dyRatio,
  pageWidthPx,
  pageHeightPx,
  thresholdPx = 18,
}: {
  annotation: Annotation
  annotations: Annotation[]
  dxRatio: number
  dyRatio: number
  pageWidthPx: number
  pageHeightPx: number
  thresholdPx?: number
}): { dxRatio: number; dyRatio: number; guides: SnapGuide[] } {
  const base = annotationBox(annotation, pageWidthPx, pageHeightPx)
  const moving = {
    ...base,
    xRatio: base.xRatio + dxRatio,
    yRatio: base.yRatio + dyRatio,
  }
  const movingAnchors = anchors(moving)
  const xTargets = [0, 0.5, 1]
  const yTargets = [0, 0.5, 1]
  for (const other of annotations) {
    if (other.id === annotation.id) continue
    const otherAnchors = anchors(annotationBox(other, pageWidthPx, pageHeightPx))
    xTargets.push(...otherAnchors.x)
    yTargets.push(...otherAnchors.y)
  }

  const xSnap = nearestSnap(movingAnchors.x, xTargets, thresholdPx / pageWidthPx)
  const ySnap = nearestSnap(movingAnchors.y, yTargets, thresholdPx / pageHeightPx)
  const guides: SnapGuide[] = []
  if (xSnap) guides.push({ axis: 'x', ratio: xSnap.guideRatio })
  if (ySnap) guides.push({ axis: 'y', ratio: ySnap.guideRatio })
  return {
    dxRatio: dxRatio + (xSnap?.adjustRatio ?? 0),
    dyRatio: dyRatio + (ySnap?.adjustRatio ?? 0),
    guides,
  }
}
