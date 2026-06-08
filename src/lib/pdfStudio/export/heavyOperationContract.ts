export type PdfHeavyOperationKind =
  | 'pdf-export'
  | 'pdf-ocr'
  | 'pdf-form'
  | 'pdf-redaction'

export type PdfHeavyOperationRunMessage<TPayload = unknown> = {
  type: 'run'
  id: string
  kind: PdfHeavyOperationKind
  payload: TPayload
}

export type PdfHeavyOperationCancelMessage = {
  type: 'cancel'
  id: string
}

export type PdfHeavyOperationWorkerRequest<TPayload = unknown> =
  | PdfHeavyOperationRunMessage<TPayload>
  | PdfHeavyOperationCancelMessage

export type PdfHeavyOperationSerializedError = {
  name?: string
  message: string
  code?: string
  phase?: string
  stack?: string
}

export type PdfHeavyOperationProgressMessage<TProgress = unknown> = {
  type: 'progress'
  id: string
  kind: PdfHeavyOperationKind
  progress: TProgress
}

export type PdfHeavyOperationCompleteMessage<TResult = unknown> = {
  type: 'complete'
  id: string
  kind: PdfHeavyOperationKind
  result: TResult
}

export type PdfHeavyOperationErrorMessage = {
  type: 'error'
  id: string
  kind: PdfHeavyOperationKind
  error: PdfHeavyOperationSerializedError
}

export type PdfHeavyOperationWorkerMessage<TResult = unknown, TProgress = unknown> =
  | PdfHeavyOperationProgressMessage<TProgress>
  | PdfHeavyOperationCompleteMessage<TResult>
  | PdfHeavyOperationErrorMessage

export class PdfHeavyOperationError extends Error {
  readonly name = 'PdfHeavyOperationError'
  readonly code?: string
  readonly phase?: string
  readonly cause?: unknown

  constructor(error: PdfHeavyOperationSerializedError, cause?: unknown) {
    super(error.message)
    this.code = error.code
    this.phase = error.phase
    this.cause = cause
    if (error.stack) this.stack = error.stack
  }
}

export function cancelledHeavyOperationError(cause?: unknown) {
  return new PdfHeavyOperationError(
    {
      message: 'Operación cancelada.',
      code: 'CANCELLED',
    },
    cause,
  )
}

export function serializePdfHeavyOperationError(
  err: unknown,
): PdfHeavyOperationSerializedError {
  if (err instanceof Error) {
    const typed = err as Error & { code?: string; phase?: string }
    return {
      name: typed.name,
      message: typed.message,
      code: typed.code,
      phase: typed.phase,
      stack: typed.stack,
    }
  }
  return {
    message: String(err || 'No se pudo completar la operación.'),
  }
}

export function deserializePdfHeavyOperationError(
  error: PdfHeavyOperationSerializedError,
) {
  return new PdfHeavyOperationError(error)
}
