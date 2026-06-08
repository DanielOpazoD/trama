import type { PdfOcrOptions, PdfOcrProgress, PdfOcrResult } from './pdfOcr'

export const PDF_OCR_OPERATION_KIND = 'pdf-ocr' as const

export type PdfOcrWorkerPayload = {
  file: File
  options: Pick<PdfOcrOptions, 'language'>
}

export type PdfOcrWorkerProgress = PdfOcrProgress
export type PdfOcrWorkerResult = PdfOcrResult
