/**
 * Guías magnéticas de casilleros (diseño de planillas): al arrastrar o
 * redimensionar, los bordes y centros se imantan a los de otros casilleros de
 * la misma página y a los bordes/centro de la página. Lógica pura en ratios;
 * el umbral llega en píxeles de pantalla para que el imán se sienta igual a
 * cualquier zoom. Alt desactiva el imán (lo maneja el pointer handler).
 */
import { nearestSnap, snapBoxAnchors, type SnapGuide } from '../editor/pdfAnnotationSnap'

export type FieldRatioBox = {
  xRatio: number
  yRatio: number
  wRatio: number
  hRatio: number
}

const FIELD_SNAP_THRESHOLD_PX = 10

function axisTargets(others: FieldRatioBox[]): { x: number[]; y: number[] } {
  const x = [0, 0.5, 1]
  const y = [0, 0.5, 1]
  for (const other of others) {
    const otherAnchors = snapBoxAnchors(other)
    x.push(...otherAnchors.x)
    y.push(...otherAnchors.y)
  }
  return { x, y }
}

/** Ajusta el delta de arrastre para imantar el casillero ancla a las guías.
 *  En arrastre múltiple, el mismo delta ajustado se aplica al grupo. */
export function snapFormFieldDrag({
  box,
  others,
  dxRatio,
  dyRatio,
  pageWidthPx,
  pageHeightPx,
  thresholdPx = FIELD_SNAP_THRESHOLD_PX,
}: {
  box: FieldRatioBox
  others: FieldRatioBox[]
  dxRatio: number
  dyRatio: number
  pageWidthPx: number
  pageHeightPx: number
  thresholdPx?: number
}): { dxRatio: number; dyRatio: number; guides: SnapGuide[] } {
  const moving = snapBoxAnchors({
    ...box,
    xRatio: box.xRatio + dxRatio,
    yRatio: box.yRatio + dyRatio,
  })
  const targets = axisTargets(others)
  const xSnap = nearestSnap(moving.x, targets.x, thresholdPx / Math.max(1, pageWidthPx))
  const ySnap = nearestSnap(moving.y, targets.y, thresholdPx / Math.max(1, pageHeightPx))
  const guides: SnapGuide[] = []
  if (xSnap) guides.push({ axis: 'x', ratio: xSnap.guideRatio })
  if (ySnap) guides.push({ axis: 'y', ratio: ySnap.guideRatio })
  return {
    dxRatio: dxRatio + (xSnap?.adjustRatio ?? 0),
    dyRatio: dyRatio + (ySnap?.adjustRatio ?? 0),
    guides,
  }
}

/** Imanta los bordes que se están moviendo durante un redimensionado: el borde
 *  opuesto queda fijo, así el snap ajusta posición y tamaño a la vez. Nunca
 *  encoge bajo el mínimo. */
export function snapResizedFormFieldBox({
  original,
  next,
  others,
  pageWidthPx,
  pageHeightPx,
  minW = 0,
  minH = 0,
  thresholdPx = FIELD_SNAP_THRESHOLD_PX,
}: {
  original: FieldRatioBox
  next: FieldRatioBox
  others: FieldRatioBox[]
  pageWidthPx: number
  pageHeightPx: number
  minW?: number
  minH?: number
  thresholdPx?: number
}): { box: FieldRatioBox; guides: SnapGuide[] } {
  const targets = axisTargets(others)
  const guides: SnapGuide[] = []
  const box = { ...next }
  const eps = 1e-6

  const leftMoved = Math.abs(next.xRatio - original.xRatio) > eps
  const rightMoved =
    Math.abs(next.xRatio + next.wRatio - (original.xRatio + original.wRatio)) > eps
  const xThreshold = thresholdPx / Math.max(1, pageWidthPx)
  if (rightMoved && !leftMoved) {
    const snap = nearestSnap([box.xRatio + box.wRatio], targets.x, xThreshold)
    if (snap && box.wRatio + snap.adjustRatio >= minW) {
      box.wRatio += snap.adjustRatio
      guides.push({ axis: 'x', ratio: snap.guideRatio })
    }
  } else if (leftMoved && !rightMoved) {
    const snap = nearestSnap([box.xRatio], targets.x, xThreshold)
    if (snap && box.wRatio - snap.adjustRatio >= minW) {
      box.xRatio += snap.adjustRatio
      box.wRatio -= snap.adjustRatio
      guides.push({ axis: 'x', ratio: snap.guideRatio })
    }
  }

  const topMoved = Math.abs(next.yRatio - original.yRatio) > eps
  const bottomMoved =
    Math.abs(next.yRatio + next.hRatio - (original.yRatio + original.hRatio)) > eps
  const yThreshold = thresholdPx / Math.max(1, pageHeightPx)
  if (bottomMoved && !topMoved) {
    const snap = nearestSnap([box.yRatio + box.hRatio], targets.y, yThreshold)
    if (snap && box.hRatio + snap.adjustRatio >= minH) {
      box.hRatio += snap.adjustRatio
      guides.push({ axis: 'y', ratio: snap.guideRatio })
    }
  } else if (topMoved && !bottomMoved) {
    const snap = nearestSnap([box.yRatio], targets.y, yThreshold)
    if (snap && box.hRatio - snap.adjustRatio >= minH) {
      box.yRatio += snap.adjustRatio
      box.hRatio -= snap.adjustRatio
      guides.push({ axis: 'y', ratio: snap.guideRatio })
    }
  }

  return { box, guides }
}
