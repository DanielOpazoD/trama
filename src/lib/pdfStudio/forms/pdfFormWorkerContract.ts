import type {
  PdfFormFillOptions,
  PdfFormFillResult,
  PdfFormFillValues,
  PdfFormInspection,
} from './pdfForms'
import type { PdfFormFieldDraft } from '../model/model'

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
  | {
      action: 'write'
      file: File
      fields: PdfFormFieldDraft[]
      pageIds: string[]
      options?: PdfFormFillOptions
    }

export type PdfFormWorkerResult = PdfFormInspection | PdfFormFillResult
export type PdfFormWorkerProgress = {
  phase: 'load' | 'inspect' | 'fill' | 'write' | 'save'
  status: 'start' | 'complete'
}
