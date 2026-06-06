import type { AssembleOptions, AssembleResult, PdfExportProgressEvent } from './assemble'
import type { PdfDoc } from './model'

export const PDF_EXPORT_OPERATION_KIND = 'pdf-export' as const

export type PdfExportWorkerPayload = {
  doc: PdfDoc
  options?: {
    compression?: AssembleOptions['compression']
  }
}

export type PdfExportWorkerResult = AssembleResult
export type PdfExportWorkerProgress = PdfExportProgressEvent
