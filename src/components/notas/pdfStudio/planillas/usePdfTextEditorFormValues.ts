import type { Dispatch, SetStateAction } from 'react'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import type { TemplateFillImportValues } from './fill/pdfTemplateFillImport'
import {
  applyTemplateFieldValues,
  clearTemplateFieldValues,
} from './fill/pdfTemplateFillValues'

/** Valores de los casilleros (modo llenar y valor inicial en diseño). Usa el
 *  setter CRUDO a propósito: escribir no entra al historial de ⌘Z — el undo
 *  de casilleros opera sobre estructura y estilo, no por tecla. */
export function usePdfTextEditorFormValues({
  setFields,
}: {
  setFields: Dispatch<SetStateAction<PdfFormFieldDraft[]>>
}) {
  function updateDraftFormValue(id: string, value: string | boolean) {
    setFields((fields) =>
      fields.map((field) => (field.id === id ? { ...field, value } : field)),
    )
  }

  function clearDraftFormValues() {
    setFields(clearTemplateFieldValues)
  }

  function applyDraftFormValues(values: TemplateFillImportValues): number {
    let applied = 0
    setFields((fields) => {
      const result = applyTemplateFieldValues(fields, values)
      applied = result.applied
      return result.fields
    })
    return applied
  }

  return { applyDraftFormValues, clearDraftFormValues, updateDraftFormValue }
}
