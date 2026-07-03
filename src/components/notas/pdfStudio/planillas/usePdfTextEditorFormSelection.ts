import { useState } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import { formFieldIdsInBox } from './pdfFormFieldArrange'
import {
  latestSelectedFormFieldId,
  mergeSelectedFormFieldIds,
  nextSelectedFormFieldIds,
} from './pdfTextEditorFormDraftModel'

type RatioBox = { xRatio: number; yRatio: number; wRatio: number; hRatio: number }

/** Selección de casilleros en diseño: por clic (aditiva con shift) y por marco
 *  sobre la página activa. El último id seleccionado es el casillero activo. */
export function usePdfTextEditorFormSelection({
  fields,
  pageId,
  setEditingId,
  setSelectedId,
}: {
  fields: PdfFormFieldDraft[]
  pageId: string | null
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

  const selectedDraftFormFields = selectedFormFieldIds
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is PdfFormFieldDraft => Boolean(field))

  return {
    selectDraftFormField,
    selectDraftFormFieldsInBox,
    selectedDraftFormFields,
    selectedFormFieldId,
    selectedFormFieldIds,
    setSelectedFormFieldIds,
  }
}
