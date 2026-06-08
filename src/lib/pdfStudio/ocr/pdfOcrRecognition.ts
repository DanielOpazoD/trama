import { assertOcrNotCancelled, emitOcrProgress } from './pdfOcrProgress'
import type { OcrLine, OcrPage, PdfOcrOptions, RenderedOcrPage } from './pdfOcrTypes'

type TesseractPageData = {
  blocks?: Array<{
    paragraphs?: Array<{
      lines?: Array<{
        text?: string
        confidence?: number
        bbox?: { x0: number; y0: number; x1: number; y1: number }
      }>
    }>
  }> | null
  text?: string
  confidence?: number
}

function linesFromTesseractPage(data: TesseractPageData): OcrLine[] {
  const lines =
    data.blocks
      ?.flatMap((block) => block.paragraphs ?? [])
      .flatMap((paragraph) => paragraph.lines ?? [])
      .filter((line) => line.text?.trim() && line.bbox)
      .map((line) => ({
        text: line.text?.trim() ?? '',
        confidence: line.confidence ?? null,
        bbox: line.bbox!,
      })) ?? []

  if (lines.length > 0) return lines
  const text = data.text?.trim()
  if (!text) return []
  return [
    {
      text,
      confidence: data.confidence ?? null,
      bbox: { x0: 24, y0: 24, x1: 900, y1: 48 },
    },
  ]
}

export async function recognizeOcrPages(
  rendered: RenderedOcrPage[],
  options: PdfOcrOptions,
): Promise<OcrPage[]> {
  const tesseract = await import('tesseract.js')
  const worker = await tesseract.createWorker(options.language, undefined, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        emitOcrProgress(options.onProgress, {
          phase: 'recognize',
          status: 'progress',
          message: message.status,
        })
      }
    },
  })

  try {
    const pages: OcrPage[] = []
    for (const renderedPage of rendered) {
      assertOcrNotCancelled(options.signal)
      emitOcrProgress(options.onProgress, {
        phase: 'recognize',
        status: 'progress',
        current: renderedPage.pageNumber,
        total: rendered.length,
      })
      const result = await worker.recognize(
        renderedPage.canvas,
        {},
        { text: true, blocks: true },
      )
      const text = result.data.text?.trim() ?? ''
      pages.push({
        pageNumber: renderedPage.pageNumber,
        text,
        confidence: Number.isFinite(result.data.confidence)
          ? result.data.confidence
          : null,
        width: renderedPage.width,
        height: renderedPage.height,
        renderWidth: renderedPage.canvas.width,
        renderHeight: renderedPage.canvas.height,
        canvas: renderedPage.canvas,
        lines: linesFromTesseractPage(result.data),
      })
    }
    return pages
  } finally {
    await worker.terminate()
  }
}
