import {
  PDF_EXPORT_OPERATION_KIND,
  type PdfExportWorkerPayload,
  type PdfExportWorkerProgress,
  type PdfExportWorkerResult,
} from './exportWorkerContract'
import {
  serializePdfHeavyOperationError,
  type PdfHeavyOperationRunMessage,
  type PdfHeavyOperationWorkerMessage,
  type PdfHeavyOperationWorkerRequest,
} from './heavyOperationContract'
import {
  PDF_FORM_OPERATION_KIND,
  type PdfFormWorkerPayload,
  type PdfFormWorkerProgress,
} from '../forms/pdfFormWorkerContract'
import {
  PDF_OCR_OPERATION_KIND,
  type PdfOcrWorkerPayload,
  type PdfOcrWorkerProgress,
  type PdfOcrWorkerResult,
} from '../ocr/pdfOcrWorkerContract'

const controllers = new Map<string, AbortController>()
const cancelled = new Set<string>()

const workerScope = self as unknown as {
  postMessage: (message: PdfHeavyOperationWorkerMessage) => void
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<PdfHeavyOperationWorkerRequest>) => void,
  ) => void
}

function post(message: PdfHeavyOperationWorkerMessage) {
  workerScope.postMessage(message)
}

async function runExport(message: PdfHeavyOperationRunMessage<PdfExportWorkerPayload>) {
  const controller = new AbortController()
  controllers.set(message.id, controller)

  try {
    const { assemble } = await import('../assemble/assemble')
    const result = await assemble(message.payload.doc, {
      compression: message.payload.options?.compression,
      signal: controller.signal,
      onProgress: (progress: PdfExportWorkerProgress) => {
        post({
          type: 'progress',
          id: message.id,
          kind: PDF_EXPORT_OPERATION_KIND,
          progress,
        })
      },
    })

    post({
      type: 'complete',
      id: message.id,
      kind: PDF_EXPORT_OPERATION_KIND,
      result: result satisfies PdfExportWorkerResult,
    })
  } catch (err) {
    post({
      type: 'error',
      id: message.id,
      kind: PDF_EXPORT_OPERATION_KIND,
      error: serializePdfHeavyOperationError(err),
    })
  } finally {
    controllers.delete(message.id)
  }
}

function progress(
  id: string,
  phase: PdfFormWorkerProgress['phase'],
  status: PdfFormWorkerProgress['status'],
) {
  post({
    type: 'progress',
    id,
    kind: PDF_FORM_OPERATION_KIND,
    progress: { phase, status },
  })
}

function throwIfCancelled(id: string) {
  if (!cancelled.has(id)) return
  const err = new Error('Operación cancelada.')
  Object.assign(err, { code: 'CANCELLED' })
  throw err
}

async function runForm(message: PdfHeavyOperationRunMessage<PdfFormWorkerPayload>) {
  try {
    const { fillPdfForm, inspectPdfForm, writePdfFormFields } =
      await import('../forms/pdfForms')
    progress(message.id, 'load', 'start')
    throwIfCancelled(message.id)
    progress(message.id, 'load', 'complete')

    if (message.payload.action === 'inspect') {
      progress(message.id, 'inspect', 'start')
      const result = await inspectPdfForm(message.payload.file)
      throwIfCancelled(message.id)
      progress(message.id, 'inspect', 'complete')
      post({
        type: 'complete',
        id: message.id,
        kind: PDF_FORM_OPERATION_KIND,
        result,
      })
      return
    }

    if (message.payload.action === 'fill') {
      progress(message.id, 'fill', 'start')
      const result = await fillPdfForm(
        message.payload.file,
        message.payload.values,
        message.payload.options,
      )
      throwIfCancelled(message.id)
      progress(message.id, 'fill', 'complete')
      progress(message.id, 'save', 'complete')
      post({
        type: 'complete',
        id: message.id,
        kind: PDF_FORM_OPERATION_KIND,
        result,
      })
      return
    }

    progress(message.id, 'write', 'start')
    const result = await writePdfFormFields(
      message.payload.file,
      message.payload.fields,
      message.payload.pageIds,
      message.payload.options,
    )
    throwIfCancelled(message.id)
    progress(message.id, 'write', 'complete')
    progress(message.id, 'save', 'complete')
    post({
      type: 'complete',
      id: message.id,
      kind: PDF_FORM_OPERATION_KIND,
      result,
    })
  } catch (err) {
    post({
      type: 'error',
      id: message.id,
      kind: PDF_FORM_OPERATION_KIND,
      error: serializePdfHeavyOperationError(err),
    })
  } finally {
    cancelled.delete(message.id)
  }
}

async function runOcr(message: PdfHeavyOperationRunMessage<PdfOcrWorkerPayload>) {
  const controller = new AbortController()
  controllers.set(message.id, controller)

  try {
    const { createSearchablePdf } = await import('../ocr/pdfOcr')
    const result = await createSearchablePdf(message.payload.file, {
      language: message.payload.options.language,
      signal: controller.signal,
      onProgress: (progress: PdfOcrWorkerProgress) => {
        post({
          type: 'progress',
          id: message.id,
          kind: PDF_OCR_OPERATION_KIND,
          progress,
        })
      },
    })

    post({
      type: 'complete',
      id: message.id,
      kind: PDF_OCR_OPERATION_KIND,
      result: result satisfies PdfOcrWorkerResult,
    })
  } catch (err) {
    post({
      type: 'error',
      id: message.id,
      kind: PDF_OCR_OPERATION_KIND,
      error: serializePdfHeavyOperationError(err),
    })
  } finally {
    controllers.delete(message.id)
  }
}

workerScope.addEventListener('message', (event) => {
  const message = event.data
  if (message.type === 'cancel') {
    controllers.get(message.id)?.abort('cancelled')
    cancelled.add(message.id)
    return
  }

  if (message.kind === PDF_EXPORT_OPERATION_KIND) {
    void runExport(message as PdfHeavyOperationRunMessage<PdfExportWorkerPayload>)
    return
  }
  if (message.kind === PDF_FORM_OPERATION_KIND) {
    void runForm(message as PdfHeavyOperationRunMessage<PdfFormWorkerPayload>)
    return
  }
  if (message.kind === PDF_OCR_OPERATION_KIND) {
    void runOcr(message as PdfHeavyOperationRunMessage<PdfOcrWorkerPayload>)
    return
  }

  post({
    type: 'error',
    id: message.id,
    kind: message.kind,
    error: {
      message: `Operación PDF pesada no soportada: ${message.kind}`,
      code: 'UNSUPPORTED_OPERATION',
    },
  })
})
