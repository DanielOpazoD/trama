import {
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react'
import type {
  PdfFormFieldDraft,
  PdfFormFieldKind,
  PdfPage,
} from '../../../../lib/pdfStudio/model/model'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import type { Tool, TextStyle } from '../editor/editorStyle'
import { makeDraftFormField } from './pdfFormFieldFactory'
import { trackNewFieldDrag } from './pdfFormFieldPointer'
import { initialFieldBox } from './pdfTextEditorFormDefaults'
import type { FormFieldStyleDefaults } from './pdfFormFieldStyleDefaults'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Colocación de casilleros con clic: armar la herramienta, colocar en la
 *  posición clicada (con arrastre opcional para dimensionar) y cancelar. */
export function usePdfTextEditorFormPlacement({
  fields,
  setFields,
  setSelectedIds,
  setEditingId,
  setSelectedId,
  setTool,
  style,
  styleDefaults,
  zoom,
}: {
  fields: PdfFormFieldDraft[]
  setFields: Dispatch<SetStateAction<PdfFormFieldDraft[]>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setEditingId: (id: string | null) => void
  setSelectedId: (id: string | null) => void
  setTool: (tool: Tool) => void
  style: TextStyle
  styleDefaults: FormFieldStyleDefaults | null
  zoom: number
}) {
  const [pendingFormKind, setPendingFormKind] = useState<PdfFormFieldKind | null>(null)

  function addFormField(kind: PdfFormFieldKind) {
    setPendingFormKind(kind)
    setTool('select')
    setEditingId(null)
    setSelectedId(null)
  }

  function cancelPendingFormField() {
    setPendingFormKind(null)
  }

  function placePendingFormField(
    e: ReactPointerEvent,
    targetPage: PdfPage | undefined,
    targetLayout: PageLayout | null,
  ) {
    if (!targetPage || !targetLayout || !pendingFormKind) return
    e.stopPropagation()
    e.preventDefault()
    const base = initialFieldBox(pendingFormKind, { ...style, ...styleDefaults })
    const xRatio = clamp01(
      e.nativeEvent.offsetX / Math.max(1, targetLayout.innerW) - base.wRatio / 2,
    )
    const yRatio = clamp01(
      e.nativeEvent.offsetY / Math.max(1, targetLayout.innerH) - base.hRatio / 2,
    )
    const field = makeDraftFormField({
      kind: pendingFormKind,
      page: targetPage,
      fields,
      style,
      styleDefaults,
      box: {
        ...base,
        xRatio: Math.min(1 - base.wRatio, xRatio),
        yRatio: Math.min(1 - base.hRatio, yRatio),
      },
    })
    if (!field) return
    setFields((current) => [...current, field])
    setSelectedIds([field.id])
    setPendingFormKind(null)
    trackNewFieldDrag({
      event: e,
      field,
      layout: targetLayout,
      setFields,
      zoom,
    })
  }

  /** Shift+clic: crea un casillero de texto centrado en el punto clicado, sin
   *  pasar por el modo de colocación. Devuelve true si lo creó. */
  function quickPlaceFormField(
    point: { xRatio: number; yRatio: number },
    targetPage: PdfPage | undefined,
  ): boolean {
    if (!targetPage) return false
    const base = initialFieldBox('text', { ...style, ...styleDefaults })
    const field = makeDraftFormField({
      kind: 'text',
      page: targetPage,
      fields,
      style,
      styleDefaults,
      box: {
        ...base,
        xRatio: Math.min(1 - base.wRatio, clamp01(point.xRatio - base.wRatio / 2)),
        yRatio: Math.min(1 - base.hRatio, clamp01(point.yRatio - base.hRatio / 2)),
      },
    })
    if (!field) return false
    setFields((current) => [...current, field])
    setSelectedIds([field.id])
    setPendingFormKind(null)
    setEditingId(null)
    setSelectedId(null)
    return true
  }

  /** Caja del casillero pendiente (para el fantasma de colocación). */
  const pendingFieldBox = pendingFormKind
    ? initialFieldBox(pendingFormKind, { ...style, ...styleDefaults })
    : null

  return {
    addFormField,
    cancelPendingFormField,
    pendingFieldBox,
    pendingFormKind,
    placePendingFormField,
    quickPlaceFormField,
  }
}
