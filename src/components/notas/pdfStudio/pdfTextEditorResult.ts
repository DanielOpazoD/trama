import { applyEdits, type PdfDoc } from '../../../lib/pdfStudio/model'
import type { PdfTextEditorResult } from './PdfTextEditor'

export function applyPdfTextEditorResult(
  doc: PdfDoc,
  edits: PdfTextEditorResult,
): PdfDoc {
  return { ...applyEdits(doc, edits.annotations), formFields: edits.formFields }
}
