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

type RasterCanvas = HTMLCanvasElement | OffscreenCanvas
type RasterContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

type OcrLine = {
  text: string
  confidence: number | null
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

type OcrPage = PdfOcrPageText & {
  width: number
  height: number
  renderWidth: number
  renderHeight: number
  canvas: RasterCanvas
  lines: OcrLine[]
}

type RenderedPage = {
  pageNumber: number
  width: number
  height: number
  canvas: RasterCanvas
}

const OCR_RENDER_MAX_DIMENSION = 1800
const INVISIBLE_TEXT_OPACITY = 0.01

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Operación cancelada.', 'AbortError')
  }
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function createRasterCanvas(width: number, height: number): RasterCanvas {
  const w = Math.max(1, Math.ceil(width))
  const h = Math.max(1, Math.ceil(height))
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h)
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    return canvas
  }
  throw new Error('Canvas no disponible para OCR')
}

function getRasterContext(canvas: RasterCanvas): RasterContext {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D no disponible para OCR')
  return context
}

function fillWhite(ctx: RasterContext, width: number, height: number) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
}

async function canvasToBlob(canvas: RasterCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('No se pudo codificar la imagen OCR'))
      },
      'image/jpeg',
      0.9,
    )
  })
}

function sidecarPageHeader(pageNumber: number): string {
  return `[Pagina ${pageNumber}]`
}

export function buildOcrSidecarText(pages: PdfOcrPageText[]): string {
  return pages
    .map((page) => `${sidecarPageHeader(page.pageNumber)}\n${page.text.trim()}`)
    .join('\n\n')
    .concat(pages.length > 0 ? '\n' : '')
}

function emit(onProgress: PdfOcrOptions['onProgress'], progress: PdfOcrProgress): void {
  onProgress?.(progress)
}

async function renderPdfPages(
  file: File,
  options: PdfOcrOptions,
): Promise<RenderedPage[]> {
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
    const rendered: RenderedPage[] = []
    for (let index = 0; index < doc.numPages; index += 1) {
      assertNotCancelled(options.signal)
      emit(options.onProgress, {
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
      const canvas = createRasterCanvas(viewport.width, viewport.height)
      const ctx = getRasterContext(canvas)
      fillWhite(ctx, canvas.width, canvas.height)
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

async function renderImagePage(file: File): Promise<RenderedPage[]> {
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
    const canvas = createRasterCanvas(width, height)
    const ctx = getRasterContext(canvas)
    fillWhite(ctx, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    return [{ pageNumber: 1, width: bitmap.width, height: bitmap.height, canvas }]
  } finally {
    bitmap.close()
  }
}

function linesFromTesseractPage(data: {
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
}): OcrLine[] {
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

async function recognizePages(
  rendered: RenderedPage[],
  options: PdfOcrOptions,
): Promise<OcrPage[]> {
  const tesseract = await import('tesseract.js')
  const worker = await tesseract.createWorker(options.language, undefined, {
    logger: (message) => {
      if (message.status === 'recognizing text') {
        emit(options.onProgress, {
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
      assertNotCancelled(options.signal)
      emit(options.onProgress, {
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

function drawInvisibleOcrText({
  font,
  page,
  rgb,
  ocrPage,
}: {
  font: { widthOfTextAtSize: (text: string, size: number) => number }
  page: {
    drawText: (text: string, options: Record<string, unknown>) => void
    getWidth?: () => number
    getHeight?: () => number
  }
  rgb: (r: number, g: number, b: number) => unknown
  ocrPage: OcrPage
}) {
  const pageWidth = page.getWidth?.() ?? ocrPage.width
  const pageHeight = page.getHeight?.() ?? ocrPage.height
  for (const line of ocrPage.lines) {
    const text = line.text.trim()
    if (!text) continue
    const x = (line.bbox.x0 / ocrPage.renderWidth) * pageWidth
    const y = pageHeight - (line.bbox.y1 / ocrPage.renderHeight) * pageHeight
    const maxWidth = Math.max(
      1,
      ((line.bbox.x1 - line.bbox.x0) / ocrPage.renderWidth) * pageWidth,
    )
    const rawSize =
      ((line.bbox.y1 - line.bbox.y0) / ocrPage.renderHeight) * pageHeight * 0.8
    const size = Math.max(4, Math.min(48, rawSize))
    page.drawText(text, {
      x,
      y,
      size,
      font,
      color: rgb(0, 0, 0),
      opacity: INVISIBLE_TEXT_OPACITY,
      maxWidth: Math.max(maxWidth, font.widthOfTextAtSize(text, size)),
    })
  }
}

async function assembleSearchablePdf(file: File, pages: OcrPage[]): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const out = await PDFDocument.create()
  const font = await out.embedFont(StandardFonts.Helvetica)

  if (isPdfFile(file)) {
    const source = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {
      ignoreEncryption: true,
    })
    for (const ocrPage of pages) {
      const [copied] = await out.copyPages(source, [ocrPage.pageNumber - 1])
      if (!copied) continue
      const page = out.addPage(copied)
      drawInvisibleOcrText({ font, page, rgb, ocrPage })
    }
  } else {
    for (const ocrPage of pages) {
      const page = out.addPage([ocrPage.width, ocrPage.height])
      const blob = await canvasToBlob(ocrPage.canvas)
      const image = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: ocrPage.width,
        height: ocrPage.height,
      })
      drawInvisibleOcrText({ font, page, rgb, ocrPage })
    }
  }

  const bytes = await out.save({ useObjectStreams: true })
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new Blob([buffer], { type: 'application/pdf' })
}

export async function createSearchablePdf(
  file: File,
  options: PdfOcrOptions,
): Promise<PdfOcrResult> {
  options.onProgress?.({ phase: 'prepare', status: 'start' })
  assertNotCancelled(options.signal)
  options.onProgress?.({ phase: 'prepare', status: 'complete' })

  const rendered = isPdfFile(file)
    ? await renderPdfPages(file, options)
    : await renderImagePage(file)
  const pages = await recognizePages(rendered, options)
  emit(options.onProgress, { phase: 'assemble', status: 'start' })
  const pdfBlob = await assembleSearchablePdf(file, pages)
  emit(options.onProgress, { phase: 'assemble', status: 'complete' })
  emit(options.onProgress, { phase: 'save', status: 'start' })
  const pageTexts = pages.map(({ pageNumber, text, confidence }) => ({
    pageNumber,
    text,
    confidence,
  }))
  const textBlob = new Blob([buildOcrSidecarText(pageTexts)], {
    type: 'text/plain;charset=utf-8',
  })
  emit(options.onProgress, { phase: 'save', status: 'complete' })

  return {
    pdfBlob,
    textBlob,
    pages: pageTexts,
    warnings: pageTexts.some((page) => page.text.trim())
      ? []
      : [
          {
            code: 'NO_TEXT',
            message: 'No se detectó texto durante el OCR.',
          },
        ],
  }
}
