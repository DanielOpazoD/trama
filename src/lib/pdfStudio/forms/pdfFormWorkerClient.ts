import { runPdfHeavyOperation } from '../export/heavyOperationClient'
import type { PdfFormFieldDraft } from '../model/model'
import {
  PDF_FORM_OPERATION_KIND,
  type PdfFormWorkerPayload,
  type PdfFormWorkerProgress,
} from './pdfFormWorkerContract'

type PdfFormFillOptions = import('./pdfForms').PdfFormFillOptions
type PdfFormFillResult = import('./pdfForms').PdfFormFillResult
type PdfFormFillValues = import('./pdfForms').PdfFormFillValues
type PdfFormInspection = import('./pdfForms').PdfFormInspection

function createPdfFormWorker(): Worker {
  if (typeof Worker === 'undefined') {
    throw new Error('Worker API unavailable')
  }
  return new Worker(new URL('./pdfForm.worker.ts', import.meta.url), {
    type: 'module',
    name: 'pdf-form-worker',
  })
}

export function inspectPdfFormInWorker(
  file: File,
  options: {
    signal?: AbortSignal
    onProgress?: (progress: PdfFormWorkerProgress) => void
  } = {},
): Promise<PdfFormInspection> {
  return runPdfHeavyOperation<
    PdfFormWorkerPayload,
    PdfFormInspection,
    PdfFormWorkerProgress
  >({
    kind: PDF_FORM_OPERATION_KIND,
    payload: { action: 'inspect', file },
    createWorker: createPdfFormWorker,
    signal: options.signal,
    onProgress: options.onProgress,
    fallback: () =>
      import('./pdfForms').then(({ inspectPdfForm }) => inspectPdfForm(file)),
  })
}

export function fillPdfFormInWorker(
  file: File,
  values: PdfFormFillValues,
  fillOptions: PdfFormFillOptions = {},
  options: {
    signal?: AbortSignal
    onProgress?: (progress: PdfFormWorkerProgress) => void
  } = {},
): Promise<PdfFormFillResult> {
  return runPdfHeavyOperation<
    PdfFormWorkerPayload,
    PdfFormFillResult,
    PdfFormWorkerProgress
  >({
    kind: PDF_FORM_OPERATION_KIND,
    payload: {
      action: 'fill',
      file,
      values,
      options: fillOptions,
    },
    createWorker: createPdfFormWorker,
    signal: options.signal,
    onProgress: options.onProgress,
    fallback: () =>
      import('./pdfForms').then(({ fillPdfForm }) =>
        fillPdfForm(file, values, fillOptions),
      ),
  })
}

export function writePdfFormFieldsInWorker(
  file: File,
  fields: PdfFormFieldDraft[],
  pageIds: string[],
  fillOptions: PdfFormFillOptions = {},
  options: {
    signal?: AbortSignal
    onProgress?: (progress: PdfFormWorkerProgress) => void
  } = {},
): Promise<PdfFormFillResult> {
  return runPdfHeavyOperation<
    PdfFormWorkerPayload,
    PdfFormFillResult,
    PdfFormWorkerProgress
  >({
    kind: PDF_FORM_OPERATION_KIND,
    payload: {
      action: 'write',
      file,
      fields,
      pageIds,
      options: fillOptions,
    },
    createWorker: createPdfFormWorker,
    signal: options.signal,
    onProgress: options.onProgress,
    fallback: () =>
      import('./pdfForms').then(({ writePdfFormFields }) =>
        writePdfFormFields(file, fields, pageIds, fillOptions),
      ),
  })
}
