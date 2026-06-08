import { assemble, type AssembleOptions, type AssembleResult } from '../assemble/assemble'
import { runPdfHeavyOperation } from './heavyOperationClient'
import {
  PDF_EXPORT_OPERATION_KIND,
  type PdfExportWorkerPayload,
  type PdfExportWorkerProgress,
} from './exportWorkerContract'
import type { PdfDoc } from '../model/model'

function createPdfExportWorker(): Worker {
  if (typeof Worker === 'undefined') {
    throw new Error('Worker API unavailable')
  }
  return new Worker(new URL('./pdfExport.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pdf-export-worker',
  })
}

export function assemblePdfInWorker(
  doc: PdfDoc,
  options: AssembleOptions = {},
): Promise<AssembleResult> {
  const payload: PdfExportWorkerPayload = {
    doc,
    options: {
      compression: options.compression,
    },
  }

  return runPdfHeavyOperation<
    PdfExportWorkerPayload,
    AssembleResult,
    PdfExportWorkerProgress
  >({
    kind: PDF_EXPORT_OPERATION_KIND,
    payload,
    createWorker: createPdfExportWorker,
    signal: options.signal,
    onProgress: options.onProgress,
    fallback: () => assemble(doc, options),
  })
}
