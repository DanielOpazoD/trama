import {
  cancelledHeavyOperationError,
  deserializePdfHeavyOperationError,
  PdfHeavyOperationError,
  type PdfHeavyOperationKind,
  type PdfHeavyOperationWorkerMessage,
  type PdfHeavyOperationWorkerRequest,
} from './heavyOperationContract'

export {
  PdfHeavyOperationError,
  type PdfHeavyOperationKind,
  type PdfHeavyOperationWorkerMessage,
  type PdfHeavyOperationWorkerRequest,
} from './heavyOperationContract'

let operationSeq = 0

export type RunPdfHeavyOperationOptions<TPayload, TResult, TProgress> = {
  kind: PdfHeavyOperationKind
  payload: TPayload
  createWorker: () => Worker
  fallback?: () => Promise<TResult>
  onProgress?: (progress: TProgress) => void
  signal?: AbortSignal
}

function nextOperationId(kind: PdfHeavyOperationKind): string {
  operationSeq += 1
  return `${kind}-${Date.now().toString(36)}-${operationSeq}`
}

function errorFromWorkerEvent(event: ErrorEvent) {
  return new PdfHeavyOperationError(
    {
      message: event.message || 'No se pudo completar la operación en segundo plano.',
      code: 'WORKER_ERROR',
    },
    event,
  )
}

export async function runPdfHeavyOperation<TPayload, TResult, TProgress = unknown>({
  kind,
  payload,
  createWorker,
  fallback,
  onProgress,
  signal,
}: RunPdfHeavyOperationOptions<TPayload, TResult, TProgress>): Promise<TResult> {
  if (signal?.aborted) {
    throw cancelledHeavyOperationError(signal.reason)
  }

  let worker: Worker
  try {
    worker = createWorker()
  } catch (err) {
    if (fallback) return fallback()
    throw new PdfHeavyOperationError(
      {
        message:
          err instanceof Error
            ? err.message
            : 'No se pudo crear el worker de operación pesada.',
        code: 'WORKER_UNAVAILABLE',
      },
      err,
    )
  }

  const id = nextOperationId(kind)

  return new Promise<TResult>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      signal?.removeEventListener('abort', abort)
      worker.terminate()
    }

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }

    const abort = () => {
      try {
        const cancelMessage: PdfHeavyOperationWorkerRequest = { type: 'cancel', id }
        worker.postMessage(cancelMessage)
      } finally {
        finish(() => reject(cancelledHeavyOperationError(signal?.reason)))
      }
    }

    worker.onmessage = (
      event: MessageEvent<PdfHeavyOperationWorkerMessage<TResult, TProgress>>,
    ) => {
      const message = event.data
      if (!message || message.id !== id) return
      if (message.type === 'progress') {
        onProgress?.(message.progress)
        return
      }
      if (message.type === 'complete') {
        finish(() => resolve(message.result))
        return
      }
      finish(() => reject(deserializePdfHeavyOperationError(message.error)))
    }

    worker.onerror = (event) => {
      finish(() => reject(errorFromWorkerEvent(event)))
    }

    signal?.addEventListener('abort', abort, { once: true })

    const runMessage: PdfHeavyOperationWorkerRequest<TPayload> = {
      type: 'run',
      id,
      kind,
      payload,
    }
    worker.postMessage(runMessage)
  })
}
