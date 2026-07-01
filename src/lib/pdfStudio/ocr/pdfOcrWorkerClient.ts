import { runPdfHeavyOperation } from '../export/heavyOperationClient'
import {
  PDF_OCR_OPERATION_KIND,
  type PdfOcrWorkerPayload,
  type PdfOcrWorkerProgress,
} from './pdfOcrWorkerContract'
import { createPdfHeavyWorker } from '../export/pdfHeavyWorkerClient'

type PdfOcrOptions = import('./pdfOcr').PdfOcrOptions
type PdfOcrResult = import('./pdfOcr').PdfOcrResult

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
    createWorker: createPdfHeavyWorker,
    signal: options.signal,
    onProgress: options.onProgress,
    fallback: () =>
      import('./pdfOcr').then(({ createSearchablePdf }) =>
        createSearchablePdf(file, options),
      ),
  })
}
