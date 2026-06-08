import type { PdfDoc } from '../../../lib/pdfStudio/model/model'
import { applyPdfTextEditorResult, type PdfTextEditorResult } from './pdfTextEditorResult'

export function usePdfStudioFilledTemplateActions({
  activeTemplateName,
  doc,
  exportPdf,
  saveFilledCopy,
}: {
  activeTemplateName: string | null
  doc: PdfDoc
  exportPdf: (
    target: PdfDoc,
    kind?: string,
    options?: { flattenFormFields?: boolean },
  ) => void | Promise<void>
  saveFilledCopy: (name: string, doc: PdfDoc) => void
}) {
  function printFilledTemplate(edits: PdfTextEditorResult) {
    void exportPdf(applyPdfTextEditorResult(doc, edits), 'planilla', {
      flattenFormFields: true,
    })
  }

  function saveFilledTemplateCopy(edits: PdfTextEditorResult) {
    saveFilledCopy(activeTemplateName ?? 'Planilla', applyPdfTextEditorResult(doc, edits))
  }

  return { printFilledTemplate, saveFilledTemplateCopy }
}
