import type { PdfDoc } from '../../../../../lib/pdfStudio/model/model'
import {
  applyPdfTextEditorResult,
  type PdfTextEditorResult,
} from '../../editor/pdfTextEditorResult'
import type { TemplateFillImportValues } from './pdfTemplateFillImport'
import { buildMailMergeDoc } from './pdfTemplateMailMerge'

export function usePdfStudioFilledTemplateActions({
  activeTemplateName,
  doc,
  openPreview,
  saveFilledCopy,
}: {
  activeTemplateName: string | null
  doc: PdfDoc
  /** Abre la planilla rellenada (aplanada) en la vista previa en modal, desde
   *  donde el usuario imprime o descarga — igual que "Guardar PDF" del editor. */
  openPreview: (
    target: PdfDoc,
    kind?: string,
    options?: { flattenFormFields?: boolean },
  ) => void | Promise<void>
  saveFilledCopy: (name: string, doc: PdfDoc) => void
}) {
  function printFilledTemplate(edits: PdfTextEditorResult) {
    void openPreview(applyPdfTextEditorResult(doc, edits), 'planilla', {
      flattenFormFields: true,
    })
  }

  function saveFilledTemplateCopy(edits: PdfTextEditorResult) {
    saveFilledCopy(activeTemplateName ?? 'Planilla', applyPdfTextEditorResult(doc, edits))
  }

  /** Lote: una copia rellenada por fila, todas en un único PDF aplanado. */
  function printMailMergeTemplate(
    edits: PdfTextEditorResult,
    rows: TemplateFillImportValues[],
  ) {
    const filled = applyPdfTextEditorResult(doc, edits)
    const { doc: merged } = buildMailMergeDoc(filled, rows)
    void openPreview(merged, 'lote', { flattenFormFields: true })
  }

  return { printFilledTemplate, printMailMergeTemplate, saveFilledTemplateCopy }
}
