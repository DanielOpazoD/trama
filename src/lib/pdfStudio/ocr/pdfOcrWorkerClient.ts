import { runPdfHeavyOperation } from '../export/heavyOperationClient'
import {
  PDF_OCR_OPERATION_KIND,
  type PdfOcrWorkerPayload,
  type PdfOcrWorkerProgress,
} from './pdfOcrWorkerContract'

type PdfOcrOptions = import('./pdfOcr').PdfOcrOptions
type PdfOcrResult = import('./pdfOcr').PdfOcrResult

function createPdfOcrWorker(): Worker {
  if (typeof Worker === 'undefined') {
    throw new Error('Worker API unavailable')
  }
  return new Worker(new URL('./pdfOcr.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pdf-ocr-worker',
  })
}

export function createSearchablePdfInWorker(
  file: File,
  options: PdfOcrOptions,
): Promise<PdfOcrResult> {
  return runPdfHeavyOperation<PdfOcrWorkerPayload, PdfOcrResult, PdfOcrWorkerProgress>({
    kind: PDF_OCR_OPERATION_KIND,
    payload: {
      file,
      options: {
        language: options.language,
      },
    },
    createWorker: createPdfOcrWorker,
    signal: options.signal,
    onProgress: options.onProgress,
    fallback: () =>
      import('./pdfOcr').then(({ createSearchablePdf }) =>
        createSearchablePdf(file, options),
      ),
  })
}
