import type {
  PdfFormFillOptions,
  PdfFormFillResult,
  PdfFormFillValues,
  PdfFormInspection,
} from './pdfForms'

export const PDF_FORM_OPERATION_KIND = 'pdf-form' as const

export type PdfFormWorkerPayload =
  | {
      action: 'inspect'
      file: File
    }
  | {
      action: 'fill'
      file: File
      values: PdfFormFillValues
      options?: PdfFormFillOptions
    }

export type PdfFormWorkerResult = PdfFormInspection | PdfFormFillResult
export type PdfFormWorkerProgress = {
  phase: 'load' | 'inspect' | 'fill' | 'save'
  status: 'start' | 'complete'
}
