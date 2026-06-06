import {
  TEXT_LINE_HEIGHT,
  type Annotation,
  type HighlightAnnotation,
  type ImageAnnotation,
  type TextAnnotation,
} from '../../../lib/pdfStudio/model'

export type AnnotationArrangeGeometry = {
  pageWidthPx: number
  pageHeightPx: number
}

export type AnnotationHorizontalAlignment = 'left' | 'center' | 'right'
export type AnnotationDistributionAxis = 'x' | 'y'
export type AnnotationLayerMove = 'front' | 'back' | 'forward' | 'backward'

type AnnotationBox = {
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
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

export function annotationArrangeBox(
  annotation: Annotation,
  { pageWidthPx, pageHeightPx }: AnnotationArrangeGeometry,
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

function unionBox(boxes: AnnotationBox[]): AnnotationBox | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((b) => b.xRatio))
  const top = Math.min(...boxes.map((b) => b.yRatio))
  const right = Math.max(...boxes.map((b) => b.xRatio + b.wRatio))
  const bottom = Math.max(...boxes.map((b) => b.yRatio + b.hRatio))
  return {
    xRatio: left,
    yRatio: top,
    wRatio: right - left,
    hRatio: bottom - top,
  }
}

export function annotationSelectionBox(
  annotations: Annotation[],
  ids: string[],
  geometry: AnnotationArrangeGeometry,
): AnnotationBox | null {
  const selected = selectedAnnotations(annotations, ids).selected
  return unionBox(selected.map((a) => annotationArrangeBox(a, geometry)))
}

function moveAnnotationToBox(
  annotation: Annotation,
  box: AnnotationBox,
  nextLeft: number,
  nextTop: number,
): Annotation {
  const dx = clamp(nextLeft, 0, Math.max(0, 1 - box.wRatio)) - box.xRatio
  const dy = clamp(nextTop, 0, Math.max(0, 1 - box.hRatio)) - box.yRatio
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return annotation

  if (annotation.kind === 'shape') {
    return {
      ...annotation,
      x0Ratio: annotation.x0Ratio + dx,
      x1Ratio: annotation.x1Ratio + dx,
      y0Ratio: annotation.y0Ratio + dy,
      y1Ratio: annotation.y1Ratio + dy,
    }
  }
  return {
    ...annotation,
    xRatio: annotation.xRatio + dx,
    yRatio: annotation.yRatio + dy,
  }
}

function selectedAnnotations(
  annotations: Annotation[],
  ids: string[],
): { ids: Set<string>; selected: Annotation[]; movable: Annotation[] } {
  const set = new Set(ids)
  const selected = annotations.filter((a) => set.has(a.id))
  return {
    ids: set,
    selected,
    movable: selected.filter((a) => !a.locked),
  }
}

export function alignAnnotations(
  annotations: Annotation[],
  ids: string[],
  alignment: AnnotationHorizontalAlignment,
  geometry: AnnotationArrangeGeometry,
): Annotation[] {
  const { ids: selectedIds, selected, movable } = selectedAnnotations(annotations, ids)
  if (movable.length === 0) return annotations

  const target =
    selected.length === 1
      ? { xRatio: 0, yRatio: 0, wRatio: 1, hRatio: 1 }
      : unionBox(selected.map((a) => annotationArrangeBox(a, geometry)))
  if (!target) return annotations

  let changed = false
  const next = annotations.map((a) => {
    if (!selectedIds.has(a.id) || a.locked) return a
    const box = annotationArrangeBox(a, geometry)
    const left =
      alignment === 'left'
        ? target.xRatio
        : alignment === 'right'
          ? target.xRatio + target.wRatio - box.wRatio
          : target.xRatio + (target.wRatio - box.wRatio) / 2
    const moved = moveAnnotationToBox(a, box, left, box.yRatio)
    if (moved !== a) changed = true
    return moved
  })
  return changed ? next : annotations
}

export function distributeAnnotations(
  annotations: Annotation[],
  ids: string[],
  axis: AnnotationDistributionAxis,
  geometry: AnnotationArrangeGeometry,
): Annotation[] {
  const { ids: selectedIds, movable } = selectedAnnotations(annotations, ids)
  if (movable.length < 3) return annotations

  const ordered = movable
    .map((annotation) => {
      const box = annotationArrangeBox(annotation, geometry)
      const center =
        axis === 'x' ? box.xRatio + box.wRatio / 2 : box.yRatio + box.hRatio / 2
      return { annotation, box, center }
    })
    .sort((a, b) => a.center - b.center)

  const first = ordered[0]!
  const last = ordered[ordered.length - 1]!
  const step = (last.center - first.center) / (ordered.length - 1)
  const centerById = new Map(
    ordered.map((entry, index) => [entry.annotation.id, first.center + step * index]),
  )

  let changed = false
  const next = annotations.map((a) => {
    if (!selectedIds.has(a.id) || a.locked) return a
    const targetCenter = centerById.get(a.id)
    if (targetCenter == null) return a
    const box = annotationArrangeBox(a, geometry)
    const moved =
      axis === 'x'
        ? moveAnnotationToBox(a, box, targetCenter - box.wRatio / 2, box.yRatio)
        : moveAnnotationToBox(a, box, box.xRatio, targetCenter - box.hRatio / 2)
    if (moved !== a) changed = true
    return moved
  })
  return changed ? next : annotations
}

export function moveAnnotationLayer(
  annotations: Annotation[],
  id: string,
  move: AnnotationLayerMove,
): Annotation[] {
  const index = annotations.findIndex((a) => a.id === id)
  if (index < 0 || annotations[index]?.locked) return annotations
  const target =
    move === 'front'
      ? annotations.length - 1
      : move === 'back'
        ? 0
        : move === 'forward'
          ? Math.min(annotations.length - 1, index + 1)
          : Math.max(0, index - 1)
  if (target === index) return annotations
  const next = [...annotations]
  const [item] = next.splice(index, 1)
  if (!item) return annotations
  next.splice(target, 0, item)
  return next
}

export function setAnnotationsLocked(
  annotations: Annotation[],
  ids: string[],
  locked: boolean,
): Annotation[] {
  const set = new Set(ids)
  let changed = false
  const next = annotations.map((a) => {
    if (!set.has(a.id) || (a.locked ?? false) === locked) return a
    changed = true
    return { ...a, locked }
  })
  return changed ? next : annotations
}

export function groupAnnotations(
  annotations: Annotation[],
  ids: string[],
  groupId: string,
): Annotation[] {
  const set = new Set(ids)
  if (set.size < 2) return annotations
  let changed = false
  const next = annotations.map((a) => {
    if (!set.has(a.id) || a.groupId === groupId) return a
    changed = true
    return { ...a, groupId }
  })
  return changed ? next : annotations
}

export function ungroupAnnotations(
  annotations: Annotation[],
  ids: string[],
): Annotation[] {
  const set = new Set(ids)
  let changed = false
  const next = annotations.map((a) => {
    if (!set.has(a.id) || !a.groupId) return a
    changed = true
    const { groupId: _groupId, ...rest } = a
    return rest as Annotation
  })
  return changed ? next : annotations
}
