import { createSearchablePdf } from './pdfOcr'
import {
  PDF_OCR_OPERATION_KIND,
  type PdfOcrWorkerPayload,
  type PdfOcrWorkerProgress,
  type PdfOcrWorkerResult,
} from './pdfOcrWorkerContract'
import {
  serializePdfHeavyOperationError,
  type PdfHeavyOperationRunMessage,
  type PdfHeavyOperationWorkerMessage,
  type PdfHeavyOperationWorkerRequest,
} from './heavyOperationContract'

const controllers = new Map<string, AbortController>()

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

async function runOcr(message: PdfHeavyOperationRunMessage<PdfOcrWorkerPayload>) {
  const controller = new AbortController()
  controllers.set(message.id, controller)

  try {
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
    return
  }
  if (message.kind !== PDF_OCR_OPERATION_KIND) {
    post({
      type: 'error',
      id: message.id,
      kind: message.kind,
      error: {
        message: `Operación no soportada por el worker OCR: ${message.kind}`,
        code: 'UNSUPPORTED_OPERATION',
      },
    })
    return
  }
  void runOcr(message as PdfHeavyOperationRunMessage<PdfOcrWorkerPayload>)
})
