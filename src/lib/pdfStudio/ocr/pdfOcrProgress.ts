import type { PdfOcrOptions, PdfOcrProgress } from './pdfOcrTypes'

export function assertOcrNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Operación cancelada.', 'AbortError')
  }
}

export function emitOcrProgress(
  onProgress: PdfOcrOptions['onProgress'],
  progress: PdfOcrProgress,
): void {
  onProgress?.(progress)
}
