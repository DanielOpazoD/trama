import type { Dispatch, SetStateAction } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import type { AnnotationDistributionAxis } from '../editor/pdfAnnotationArrange'
import {
  alignFormFields,
  distributeFormFields,
  matchFormFieldsSize,
  type FormFieldAlignment,
  type FormFieldSizeDimension,
} from './pdfFormFieldArrange'
import { duplicateFormFields } from './pdfFormFieldShortcuts'

/** Operaciones de layout sobre la selección de casilleros: alinear (6 ejes),
 *  distribuir, igualar tamaños y duplicar el grupo. */
export function usePdfTextEditorFormArrange({
  fields,
  selectedIds,
  setFields,
  setSelectedIds,
}: {
  fields: PdfFormFieldDraft[]
  selectedIds: string[]
  setFields: Dispatch<SetStateAction<PdfFormFieldDraft[]>>
  setSelectedIds: Dispatch<SetStateAction<string[]>>
}) {
  function alignDraftFormFields(alignment: FormFieldAlignment) {
    if (selectedIds.length === 0) return
    setFields((fields) => alignFormFields(fields, selectedIds, alignment))
  }

  function distributeDraftFormFields(axis: AnnotationDistributionAxis) {
    if (selectedIds.length < 3) return
    setFields((fields) => distributeFormFields(fields, selectedIds, axis))
  }

  function matchDraftFormFieldSizes(dimension: FormFieldSizeDimension) {
    if (selectedIds.length < 2) return
    // El activo (último seleccionado) es la referencia de tamaño.
    const referenceId = selectedIds[selectedIds.length - 1]
    setFields((fields) =>
      matchFormFieldsSize(fields, selectedIds, dimension, referenceId),
    )
  }

  function duplicateSelectedDraftFormFields() {
    if (selectedIds.length === 0) return
    const duplicated = duplicateFormFields(fields, selectedIds)
    if (duplicated.fields === fields) return
    setFields(duplicated.fields)
    setSelectedIds(duplicated.selectedIds)
  }

  return {
    alignDraftFormFields,
    distributeDraftFormFields,
    duplicateSelectedDraftFormFields,
    matchDraftFormFieldSizes,
  }
}
