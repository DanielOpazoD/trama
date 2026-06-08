import type { Dispatch, SetStateAction } from 'react'
import type { PdfFormFieldDraft } from '../../../lib/pdfStudio/model/model'
import type {
  AnnotationDistributionAxis,
  AnnotationHorizontalAlignment,
} from './pdfAnnotationArrange'
import { alignFormFields, distributeFormFields } from './pdfFormFieldArrange'

export function usePdfTextEditorFormArrange({
  selectedIds,
  setFields,
}: {
  selectedIds: string[]
  setFields: Dispatch<SetStateAction<PdfFormFieldDraft[]>>
}) {
  function alignDraftFormFields(alignment: AnnotationHorizontalAlignment) {
    if (selectedIds.length === 0) return
    setFields((fields) => alignFormFields(fields, selectedIds, alignment))
  }

  function distributeDraftFormFields(axis: AnnotationDistributionAxis) {
    if (selectedIds.length < 3) return
    setFields((fields) => distributeFormFields(fields, selectedIds, axis))
  }

  return { alignDraftFormFields, distributeDraftFormFields }
}
