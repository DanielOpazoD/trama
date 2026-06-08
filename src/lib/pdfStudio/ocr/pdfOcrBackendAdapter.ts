import type { PdfOcrOptions, PdfOcrResult } from './pdfOcr'

export type PdfOcrBackendAdapter = {
  kind: 'client' | 'backend'
  run: (file: File, options: PdfOcrOptions) => Promise<PdfOcrResult>
}

export class PdfOcrBackendUnavailableError extends Error {
  readonly name = 'PdfOcrBackendUnavailableError'
  readonly code = 'OCR_BACKEND_UNAVAILABLE'
}

export function createClientPdfOcrAdapter(
  run: PdfOcrBackendAdapter['run'],
): PdfOcrBackendAdapter {
  return {
    kind: 'client',
    run,
  }
}

export const backendPdfOcrAdapterPlaceholder: PdfOcrBackendAdapter = {
  kind: 'backend',
  async run() {
    throw new PdfOcrBackendUnavailableError(
      'OCR backend no configurado. La version actual usa OCR client-side.',
    )
  },
}
