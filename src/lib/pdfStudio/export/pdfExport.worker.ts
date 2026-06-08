import { assemble } from '../assemble/assemble'
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

async function runExport(message: PdfHeavyOperationRunMessage<PdfExportWorkerPayload>) {
  const controller = new AbortController()
  controllers.set(message.id, controller)

  try {
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

workerScope.addEventListener('message', (event) => {
  const message = event.data
  if (message.type === 'cancel') {
    controllers.get(message.id)?.abort('cancelled')
    return
  }
  if (message.kind !== PDF_EXPORT_OPERATION_KIND) {
    post({
      type: 'error',
      id: message.id,
      kind: message.kind,
      error: {
        message: `Operación no soportada por el worker de exportación: ${message.kind}`,
        code: 'UNSUPPORTED_OPERATION',
      },
    })
    return
  }
  void runExport(message as PdfHeavyOperationRunMessage<PdfExportWorkerPayload>)
})
