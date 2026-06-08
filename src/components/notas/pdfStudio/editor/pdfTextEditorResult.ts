import {
  applyEdits,
  type Annotation,
  type DocSettings,
  type PdfDoc,
  type PdfFormFieldDraft,
} from '../../../../lib/pdfStudio/model/model'

export type PdfTextEditorResult = {
  annotations: Record<number, Annotation[]>
  formFields: PdfFormFieldDraft[]
  /** Ajustes del documento que el editor pudo cambiar (ej. tamaño global de X). */
  settings?: DocSettings
}

export function applyPdfTextEditorResult(
  doc: PdfDoc,
  edits: PdfTextEditorResult,
): PdfDoc {
  const next = { ...applyEdits(doc, edits.annotations), formFields: edits.formFields }
  return edits.settings ? { ...next, settings: edits.settings } : next
}
