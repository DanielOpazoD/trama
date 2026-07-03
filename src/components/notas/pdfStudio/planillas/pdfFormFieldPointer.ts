import type { Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import {
  resizeRatioBox,
  screenDeltaToPage,
  type PageLayout,
  type ResizeHandle,
} from '../../../../lib/pdfStudio/model/editorGeometry'
import { trackPointerMove } from '../editor/pdfTextEditorPointerListeners'
import type { SnapGuide } from '../editor/pdfAnnotationSnap'
import {
  snapFormFieldDrag,
  snapResizedFormFieldBox,
  type FieldRatioBox,
} from './pdfFormFieldSnap'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
type SetFields = Dispatch<SetStateAction<PdfFormFieldDraft[]>>
type RatioBox = Pick<PdfFormFieldDraft, 'xRatio' | 'yRatio' | 'wRatio' | 'hRatio'>

/** Guías magnéticas del gesto: cajas objetivo (misma página, no arrastradas) y
 *  callback para pintar/limpiar las líneas. Alt desactiva el imán. */
export type FieldSnapContext = {
  targets: FieldRatioBox[]
  onGuides: (guides: SnapGuide[]) => void
}

export function newFieldBoxFromDrag({
  currentClientX,
  currentClientY,
  fallback,
  layout,
  startClientX,
  startClientY,
  startOffsetX,
  startOffsetY,
  zoom,
}: {
  currentClientX: number
  currentClientY: number
  fallback: RatioBox
  layout: PageLayout
  startClientX: number
  startClientY: number
  startOffsetX: number
  startOffsetY: number
  zoom: number
}): RatioBox {
  const dw = layout.innerW * zoom
  const dh = layout.innerH * zoom
  const startRatio = {
    x: startOffsetX / Math.max(1, layout.innerW),
    y: startOffsetY / Math.max(1, layout.innerH),
  }
  const { dx, dy } = screenDeltaToPage(
    currentClientX - startClientX,
    currentClientY - startClientY,
    layout.rot,
  )
  if (Math.hypot(dx, dy) < 3) {
    return {
      ...fallback,
      xRatio: Math.min(1 - fallback.wRatio, clamp01(startRatio.x - fallback.wRatio / 2)),
      yRatio: Math.min(1 - fallback.hRatio, clamp01(startRatio.y - fallback.hRatio / 2)),
    }
  }
  const x2 = clamp01(startRatio.x + dx / dw)
  const y2 = clamp01(startRatio.y + dy / dh)
  const wRatio = Math.max(Math.abs(x2 - startRatio.x), 14 / dw)
  const hRatio = Math.max(Math.abs(y2 - startRatio.y), 14 / dh)
  return {
    xRatio: Math.min(1 - wRatio, Math.min(startRatio.x, x2)),
    yRatio: Math.min(1 - hRatio, Math.min(startRatio.y, y2)),
    wRatio,
    hRatio,
  }
}

export function trackNewFieldDrag({
  event,
  field,
  layout,
  setFields,
  zoom,
}: {
  event: ReactPointerEvent
  field: PdfFormFieldDraft
  layout: PageLayout
  setFields: SetFields
  zoom: number
}) {
  const startX = event.clientX
  const startY = event.clientY
  const startOffsetX = event.nativeEvent.offsetX
  const startOffsetY = event.nativeEvent.offsetY
  const move = (ev: PointerEvent) => {
    const next = newFieldBoxFromDrag({
      currentClientX: ev.clientX,
      currentClientY: ev.clientY,
      fallback: field,
      layout,
      startClientX: startX,
      startClientY: startY,
      startOffsetX,
      startOffsetY,
      zoom,
    })
    setFields((fields) =>
      fields.map((item) => (item.id === field.id ? { ...item, ...next } : item)),
    )
  }
  trackPointerMove(move)
}

export function startFormFieldDrag({
  event,
  field,
  fields,
  layout,
  selectedIds,
  setFields,
  snap,
  zoom,
}: {
  event: ReactPointerEvent
  field: PdfFormFieldDraft
  fields: PdfFormFieldDraft[]
  layout: PageLayout | null
  selectedIds: string[]
  setFields: SetFields
  snap?: FieldSnapContext
  zoom: number
}) {
  if (!layout || field.readOnly) return
  event.stopPropagation()
  const dw = layout.innerW * zoom
  const dh = layout.innerH * zoom
  const startX = event.clientX
  const startY = event.clientY
  const ids = selectedIds.includes(field.id) ? selectedIds : [field.id]
  const starts = new Map(fields.map((item) => [item.id, item]))
  const anchorStart = starts.get(field.id) ?? field
  const move = (ev: PointerEvent) => {
    const { dx, dy } = screenDeltaToPage(
      ev.clientX - startX,
      ev.clientY - startY,
      layout.rot,
    )
    let dxRatio = dx / dw
    let dyRatio = dy / dh
    if (snap && !ev.altKey) {
      const snapped = snapFormFieldDrag({
        box: anchorStart,
        others: snap.targets,
        dxRatio,
        dyRatio,
        pageWidthPx: dw,
        pageHeightPx: dh,
      })
      dxRatio = snapped.dxRatio
      dyRatio = snapped.dyRatio
      snap.onGuides(snapped.guides)
    } else {
      snap?.onGuides([])
    }
    setFields((items) =>
      items.map((item) => {
        if (!ids.includes(item.id) || item.readOnly) return item
        const start = starts.get(item.id) ?? item
        const xRatio = clamp01(start.xRatio + dxRatio)
        const yRatio = clamp01(start.yRatio + dyRatio)
        return {
          ...item,
          xRatio: Math.min(1 - item.wRatio, xRatio),
          yRatio: Math.min(1 - item.hRatio, yRatio),
        }
      }),
    )
  }
  trackPointerMove(move, () => snap?.onGuides([]))
}

export function startFormFieldResize({
  event,
  field,
  handle,
  layout,
  setFields,
  snap,
  zoom,
}: {
  event: ReactPointerEvent
  field: PdfFormFieldDraft
  handle: ResizeHandle
  layout: PageLayout | null
  setFields: SetFields
  snap?: FieldSnapContext
  zoom: number
}) {
  if (!layout || field.readOnly) return
  event.stopPropagation()
  event.preventDefault()
  const dw = layout.innerW * zoom
  const dh = layout.innerH * zoom
  const startX = event.clientX
  const startY = event.clientY
  const minW = 14 / dw
  const minH = 14 / dh
  const move = (ev: PointerEvent) => {
    const { dx, dy } = screenDeltaToPage(
      ev.clientX - startX,
      ev.clientY - startY,
      layout.rot,
    )
    let next = resizeRatioBox(field, handle, dx / dw, dy / dh, { minW, minH })
    if (snap && !ev.altKey) {
      const snapped = snapResizedFormFieldBox({
        original: field,
        next,
        others: snap.targets,
        pageWidthPx: dw,
        pageHeightPx: dh,
        minW,
        minH,
      })
      next = snapped.box
      snap.onGuides(snapped.guides)
    } else {
      snap?.onGuides([])
    }
    setFields((fields) =>
      fields.map((item) => (item.id === field.id ? { ...item, ...next } : item)),
    )
  }
  trackPointerMove(move, () => snap?.onGuides([]))
}
