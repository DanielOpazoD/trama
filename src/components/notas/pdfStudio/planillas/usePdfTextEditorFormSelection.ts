import { useState } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import { formFieldIdsInBox } from './pdfFormFieldArrange'
import { orderFormFieldsForFill } from './pdfFormFieldFillOrder'
import {
  latestSelectedFormFieldId,
  mergeSelectedFormFieldIds,
  nextSelectedFormFieldIds,
} from './pdfTextEditorFormDraftModel'

type RatioBox = { xRatio: number; yRatio: number; wRatio: number; hRatio: number }

/** Selección de casilleros en diseño: por clic (aditiva con shift), por marco
 *  sobre la página activa y secuencial (‹ › del inspector). El último id
 *  seleccionado es el casillero activo. */
export function usePdfTextEditorFormSelection({
  fields,
  pageId,
  pageIndexById,
  setEditingId,
  setSelectedId,
}: {
  fields: PdfFormFieldDraft[]
  pageId: string | null
  pageIndexById: Record<string, number>
  setEditingId: (id: string | null) => void
  setSelectedId: (id: string | null) => void
}) {
  const [selectedFormFieldIds, setSelectedFormFieldIds] = useState<string[]>([])
  const selectedFormFieldId = latestSelectedFormFieldId(selectedFormFieldIds)

  function clearAnnotationFocus() {
    setSelectedId(null)
    setEditingId(null)
  }

  function selectDraftFormField(id: string, additive = false) {
    setSelectedFormFieldIds((selected) =>
      nextSelectedFormFieldIds(selected, id, additive),
    )
    clearAnnotationFocus()
  }

  /** Marco de selección sobre la página activa. Devuelve true si capturó
   *  casilleros; un marco vacío limpia la selección (salvo con shift). */
  function selectDraftFormFieldsInBox(box: RatioBox, additive = false): boolean {
    const ids = formFieldIdsInBox(fields, pageId, box)
    if (ids.length === 0) {
      if (!additive) setSelectedFormFieldIds([])
      return false
    }
    setSelectedFormFieldIds((selected) =>
      additive ? mergeSelectedFormFieldIds(selected, ids) : ids,
    )
    clearAnnotationFocus()
    return true
  }

  /** Selecciona el casillero anterior/siguiente en orden visual (páginas y
   *  posición), ciclando. Devuelve el campo elegido para poder enfocar su
   *  página desde afuera. */
  function selectAdjacentDraftFormField(direction: 1 | -1): PdfFormFieldDraft | null {
    if (fields.length === 0) return null
    const ordered = orderFormFieldsForFill(fields, pageIndexById)
    const currentIndex = ordered.findIndex((field) => field.id === selectedFormFieldId)
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : ordered.length - 1
        : (currentIndex + direction + ordered.length) % ordered.length
    const next = ordered[nextIndex]!
    setSelectedFormFieldIds([next.id])
    clearAnnotationFocus()
    return next
  }

  const selectedDraftFormFields = selectedFormFieldIds
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is PdfFormFieldDraft => Boolean(field))

  return {
    selectAdjacentDraftFormField,
    selectDraftFormField,
    selectDraftFormFieldsInBox,
    selectedDraftFormFields,
    selectedFormFieldId,
    selectedFormFieldIds,
    setSelectedFormFieldIds,
  }
}
