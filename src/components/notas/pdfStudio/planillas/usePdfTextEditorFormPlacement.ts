import {
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'
import type {
  PdfFormFieldDraft,
  PdfFormFieldKind,
  PdfPage,
} from '../../../../lib/pdfStudio/model/model'
import type { PageLayout } from '../../../../lib/pdfStudio/model/editorGeometry'
import type { Tool, TextStyle } from '../editor/editorStyle'
import { makeDraftFormField } from './pdfFormFieldFactory'
import { focusFormFieldControl } from './pdfFormFieldFocus'
import { trackNewFieldDrag } from './pdfFormFieldPointer'
import { initialFieldBox } from './pdfTextEditorFormDefaults'
import {
  applyDefaultsToInitialBox,
  type FormFieldStyleDefaults,
} from './pdfFormFieldStyleDefaults'

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Colocación de casilleros con clic: armar la herramienta, colocar en la
 *  posición clicada (con arrastre opcional para dimensionar) y cancelar. */
export function usePdfTextEditorFormPlacement({
  fields,
  setFields,
  setFieldsLive,
  setSelectedIds,
  setEditingId,
  setSelectedId,
  setTool,
  style,
  styleDefaults,
  zoom,
}: {
  fields: PdfFormFieldDraft[]
  /** Setter con historia (⌘Z): crear un casillero es una operación discreta. */
  setFields: Dispatch<SetStateAction<PdfFormFieldDraft[]>>
  /** Setter crudo para el arrastre de dimensionado post-colocación. */
  setFieldsLive?: Dispatch<SetStateAction<PdfFormFieldDraft[]>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
  setEditingId: (id: string | null) => void
  setSelectedId: (id: string | null) => void
  setTool: (tool: Tool) => void
  style: TextStyle
  styleDefaults: FormFieldStyleDefaults | null
  zoom: number
}) {
  const [pendingFormKind, setPendingFormKind] = useState<PdfFormFieldKind | null>(null)

  /** Caja inicial del casillero: la calculada por tipo, con el tamaño
   *  recordado del estilo default cuando es de texto. */
  function initialBoxFor(kind: PdfFormFieldKind) {
    return applyDefaultsToInitialBox(
      initialFieldBox(kind, { ...style, ...styleDefaults }),
      kind === 'text' ? styleDefaults : null,
    )
  }

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
    const base = initialBoxFor(pendingFormKind)
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
      setFields: setFieldsLive ?? setFields,
      zoom,
    })
  }

  /** Shift+clic: crea un casillero de texto centrado en el punto clicado, sin
   *  pasar por el modo de colocación. Devuelve true si lo creó. */
  const focusTimerRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current)
    },
    [],
  )

  function quickPlaceFormField(
    point: { xRatio: number; yRatio: number },
    targetPage: PdfPage | undefined,
  ): boolean {
    if (!targetPage) return false
    const base = initialBoxFor('text')
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
    // Escribir al tiro: cuando el casillero ya está pintado, el foco cae en
    // su input sin pasar por el panel. El temporizador se guarda para
    // cancelarlo si el editor se desmonta antes: un foco tardío sobre un DOM
    // que ya no existe reventaba (`document is not defined` en la suite).
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current)
    focusTimerRef.current = window.setTimeout(() => {
      focusTimerRef.current = null
      focusFormFieldControl(field.id, { select: true })
    }, 60)
    return true
  }

  /** Caja del casillero pendiente (para el fantasma de colocación). */
  const pendingFieldBox = pendingFormKind ? initialBoxFor(pendingFormKind) : null

  return {
    addFormField,
    cancelPendingFormField,
    pendingFieldBox,
    pendingFormKind,
    placePendingFormField,
    quickPlaceFormField,
  }
}
