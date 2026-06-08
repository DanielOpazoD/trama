export type PdfExportPhase =
  | 'load-fonts'
  | 'validate-images'
  | 'process-pages'
  | 'apply-annotations'
  | 'compress'
  | 'save'

export type PdfExportProgressStatus = 'start' | 'progress' | 'complete'

export type PdfExportProgressEvent = {
  phase: PdfExportPhase
  status: PdfExportProgressStatus
  current?: number
  total?: number
  message?: string
}

export type AssembleOptions = {
  compression?: 'balanced' | 'compatibility'
  onProgress?: (event: PdfExportProgressEvent) => void
  signal?: AbortSignal
}

export type SkippedSource = { name: string; reason: string }
export type PdfExportWarningCode = 'LARGE_EXPORT' | 'LARGE_IMAGE_SET'
export type PdfExportWarning = { code: PdfExportWarningCode; message: string }

export type PdfExportErrorCode =
  | 'CANCELLED'
  | 'NO_PAGES_EXPORTED'
  | 'FONT_LOAD_FAILED'
  | 'IMAGE_PROCESSING_FAILED'
  | 'PDF_PROCESSING_FAILED'
  | 'SAVE_FAILED'

export class PdfExportPipelineError extends Error {
  readonly name = 'PdfExportPipelineError'
  readonly phase: PdfExportPhase
  readonly code: PdfExportErrorCode
  readonly cause?: unknown

  constructor({
    phase,
    code,
    message,
    cause,
  }: {
    phase: PdfExportPhase
    code: PdfExportErrorCode
    message: string
    cause?: unknown
  }) {
    super(message)
    this.phase = phase
    this.code = code
    this.cause = cause
  }
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function createProgressEmitter(onProgress: AssembleOptions['onProgress']) {
  return (event: PdfExportProgressEvent) => onProgress?.(event)
}

export function throwIfAborted(signal: AbortSignal | undefined, phase: PdfExportPhase) {
  if (!signal?.aborted) return
  throw new PdfExportPipelineError({
    phase,
    code: 'CANCELLED',
    message: 'Exportación cancelada.',
    cause: signal.reason,
  })
}
