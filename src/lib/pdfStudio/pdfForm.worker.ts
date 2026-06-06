import { fillPdfForm, inspectPdfForm } from './pdfForms'
import {
  PDF_FORM_OPERATION_KIND,
  type PdfFormWorkerPayload,
  type PdfFormWorkerProgress,
} from './pdfFormWorkerContract'
import {
  serializePdfHeavyOperationError,
  type PdfHeavyOperationRunMessage,
  type PdfHeavyOperationWorkerMessage,
  type PdfHeavyOperationWorkerRequest,
} from './heavyOperationContract'

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

workerScope.addEventListener('message', (event) => {
  const message = event.data
  if (message.type === 'cancel') {
    cancelled.add(message.id)
    return
  }
  if (message.kind !== PDF_FORM_OPERATION_KIND) {
    post({
      type: 'error',
      id: message.id,
      kind: message.kind,
      error: {
        message: `Operación no soportada por el worker de formularios: ${message.kind}`,
        code: 'UNSUPPORTED_OPERATION',
      },
    })
    return
  }
  void runForm(message as PdfHeavyOperationRunMessage<PdfFormWorkerPayload>)
})
