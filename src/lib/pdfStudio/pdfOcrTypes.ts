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

export type RasterCanvas = HTMLCanvasElement | OffscreenCanvas
export type RasterContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export type OcrLine = {
  text: string
  confidence: number | null
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

export type OcrPage = PdfOcrPageText & {
  width: number
  height: number
  renderWidth: number
  renderHeight: number
  canvas: RasterCanvas
  lines: OcrLine[]
}

export type RenderedOcrPage = {
  pageNumber: number
  width: number
  height: number
  canvas: RasterCanvas
}
