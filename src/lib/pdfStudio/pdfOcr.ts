export type PdfOcrLanguage = 'spa' | 'eng' | 'spa+eng'

export type PdfOcrOptions = {
  language: PdfOcrLanguage
  signal?: AbortSignal
  onProgress?: (progress: PdfOcrProgress) => void
}

export type PdfOcrProgress = {
  phase: 'prepare' | 'render' | 'recognize' | 'assemble' | 'save'
  status: 'start' | 'progress' | 'complete'
  current?: number
  total?: number
  message?: string
}

export type PdfOcrPageText = {
  pageNumber: number
  text: string
  confidence: number | null
}

export type PdfOcrWarning = {
  code: 'NO_TEXT' | 'LARGE_DOCUMENT' | 'FALLBACK_TEXT_LAYER'
  message: string
}

export type PdfOcrResult = {
  pdfBlob: Blob
  textBlob: Blob
  pages: PdfOcrPageText[]
  warnings: PdfOcrWarning[]
}

export async function createSearchablePdf(
  file: File,
  options: PdfOcrOptions,
): Promise<PdfOcrResult> {
  options.onProgress?.({ phase: 'prepare', status: 'start' })
  if (options.signal?.aborted) {
    throw new DOMException('Operación cancelada.', 'AbortError')
  }
  options.onProgress?.({ phase: 'prepare', status: 'complete' })
  const pdfBlob = new Blob([await file.arrayBuffer()], { type: 'application/pdf' })
  const textBlob = new Blob([''], { type: 'text/plain;charset=utf-8' })
  return {
    pdfBlob,
    textBlob,
    pages: [],
    warnings: [
      {
        code: 'NO_TEXT',
        message: 'OCR pendiente: no se detectó texto en esta versión inicial.',
      },
    ],
  }
}
