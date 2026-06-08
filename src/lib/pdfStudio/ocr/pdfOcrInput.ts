import {
  createOcrCanvas,
  fillOcrCanvasWhite,
  getOcrCanvasContext,
  OCR_RENDER_MAX_DIMENSION,
} from './pdfOcrCanvas'
import { assertOcrNotCancelled, emitOcrProgress } from './pdfOcrProgress'
import type { PdfOcrOptions, RenderedOcrPage } from './pdfOcrTypes'

export function isPdfOcrInput(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export async function renderOcrInputPages(
  file: File,
  options: PdfOcrOptions,
): Promise<RenderedOcrPage[]> {
  return isPdfOcrInput(file) ? renderPdfPages(file, options) : renderImagePage(file)
}

async function renderPdfPages(
  file: File,
  options: PdfOcrOptions,
): Promise<RenderedOcrPage[]> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({
    data,
    disableWorker: true,
  } as unknown as Parameters<typeof pdfjs.getDocument>[0])

  try {
    const doc = await task.promise
    const rendered: RenderedOcrPage[] = []
    for (let index = 0; index < doc.numPages; index += 1) {
      assertOcrNotCancelled(options.signal)
      emitOcrProgress(options.onProgress, {
        phase: 'render',
        status: 'progress',
        current: index + 1,
        total: doc.numPages,
      })
      const page = await doc.getPage(index + 1)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(
        2,
        OCR_RENDER_MAX_DIMENSION / Math.max(base.width, base.height),
      )
      const viewport = page.getViewport({ scale })
      const canvas = createOcrCanvas(viewport.width, viewport.height)
      const ctx = getOcrCanvasContext(canvas)
      fillOcrCanvasWhite(ctx, canvas.width, canvas.height)
      await page.render({
        canvas: canvas as HTMLCanvasElement,
        canvasContext: ctx as CanvasRenderingContext2D,
        viewport,
      }).promise
      rendered.push({
        pageNumber: index + 1,
        width: base.width,
        height: base.height,
        canvas,
      })
    }
    return rendered
  } finally {
    await task.destroy().catch(() => {})
  }
}

async function renderImagePage(file: File): Promise<RenderedOcrPage[]> {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('createImageBitmap no disponible para OCR de imagenes')
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(
      1,
      OCR_RENDER_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    )
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = createOcrCanvas(width, height)
    const ctx = getOcrCanvasContext(canvas)
    fillOcrCanvasWhite(ctx, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    return [{ pageNumber: 1, width: bitmap.width, height: bitmap.height, canvas }]
  } finally {
    bitmap.close()
  }
}
