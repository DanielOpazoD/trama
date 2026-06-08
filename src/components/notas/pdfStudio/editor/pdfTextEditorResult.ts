import {
  applyEdits,
  type Annotation,
  type PdfDoc,
  type PdfFormFieldDraft,
} from '../../../../lib/pdfStudio/model/model'

export type PdfTextEditorResult = {
  annotations: Record<number, Annotation[]>
  formFields: PdfFormFieldDraft[]
}

export function applyPdfTextEditorResult(
  doc: PdfDoc,
  edits: PdfTextEditorResult,
): PdfDoc {
  return { ...applyEdits(doc, edits.annotations), formFields: edits.formFields }
}
