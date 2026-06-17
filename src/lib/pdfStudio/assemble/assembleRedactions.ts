import type { PDFDocument, PDFPage } from 'pdf-lib'
import { imageCompressionPolicy, type PdfImageCompressionMode } from './assembleImages'
import type {
  Annotation,
  PdfPage as PdfModelPage,
  PdfSource,
  RedactionAnnotation,
} from '../model/model'

type RasterCanvas = HTMLCanvasElement | OffscreenCanvas
type RasterContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

type RasterizedPage = {
  canvas: RasterCanvas
  pageWidth: number
  pageHeight: number
}

export function pageHasRedactions(page: PdfModelPage): boolean {
  return page.annotations.some((annotation) => annotation.kind === 'redaction')
}

export function annotationsWithoutRedactions(annotations: Annotation[]): Annotation[] {
  return annotations.filter((annotation) => annotation.kind !== 'redaction')
}

function redactionsFor(page: PdfModelPage): RedactionAnnotation[] {
  return page.annotations.filter(
    (annotation): annotation is RedactionAnnotation => annotation.kind === 'redaction',
  )
}

function createRasterCanvas(width: number, height: number): RasterCanvas {
  const w = Math.max(1, Math.ceil(width))
  const h = Math.max(1, Math.ceil(height))
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    return canvas
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h)
  }
  throw new Error('Canvas no disponible para redacción segura')
}

function getRasterContext(canvas: RasterCanvas): RasterContext {
  const ctx = canvas.getContext('2d') as RasterContext | null
  if (!ctx) throw new Error('Canvas 2D no disponible para redacción segura')
  return ctx
}

function fillWhite(ctx: RasterContext, width: number, height: number) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
}

function burnRedactions(
  ctx: RasterContext,
  width: number,
  height: number,
  redactions: RedactionAnnotation[],
) {
  for (const redaction of redactions) {
    ctx.fillStyle = redaction.color || '#000000'
    ctx.fillRect(
      redaction.xRatio * width,
      redaction.yRatio * height,
      redaction.wRatio * width,
      redaction.hRatio * height,
    )
  }
}

async function canvasToBlob(
  canvas: RasterCanvas,
  type: string,
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality })
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('No se pudo codificar la página redactada'))
      },
      type,
      quality,
    )
  })
}

async function imageBitmapFromFile(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' })
  }
  throw new Error('createImageBitmap no disponible para redacción segura')
}

async function rasterizeImagePage(
  source: PdfSource,
  compression: PdfImageCompressionMode | undefined,
): Promise<RasterizedPage> {
  const policy = imageCompressionPolicy(compression)
  const bitmap = await imageBitmapFromFile(source.file)
  try {
    const scale = Math.min(
      1,
      policy.jpegMaxDimension / Math.max(bitmap.width, bitmap.height),
    )
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = createRasterCanvas(width, height)
    const ctx = getRasterContext(canvas)
    fillWhite(ctx, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    return { canvas, pageWidth: width, pageHeight: height }
  } finally {
    bitmap.close()
  }
}

async function rasterizePdfPage(
  source: PdfSource,
  pageIndex: number,
  compression: PdfImageCompressionMode | undefined,
): Promise<RasterizedPage> {
  const policy = imageCompressionPolicy(compression)
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const data = new Uint8Array(await source.file.arrayBuffer())
  const task = pdfjs.getDocument({
    data,
    disableWorker: true,
  } as unknown as Parameters<typeof pdfjs.getDocument>[0])
  try {
    const doc = await task.promise
    const page = await doc.getPage(pageIndex + 1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(2, policy.jpegMaxDimension / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale })
    const canvas = createRasterCanvas(viewport.width, viewport.height)
    const ctx = getRasterContext(canvas)
    fillWhite(ctx, canvas.width, canvas.height)
    await page.render({
      canvas: canvas as HTMLCanvasElement,
      canvasContext: ctx as CanvasRenderingContext2D,
      viewport,
    }).promise
    return { canvas, pageWidth: base.width, pageHeight: base.height }
  } finally {
    await task.destroy().catch(() => {})
  }
}

export async function addRedactedRasterPage({
  out,
  source,
  page,
  compression,
}: {
  out: PDFDocument
  source: PdfSource
  page: PdfModelPage
  compression?: PdfImageCompressionMode
}): Promise<PDFPage> {
  const raster =
    page.kind === 'pdf'
      ? await rasterizePdfPage(source, page.pageIndex, compression)
      : await rasterizeImagePage(source, compression)
  const ctx = getRasterContext(raster.canvas)
  burnRedactions(ctx, raster.canvas.width, raster.canvas.height, redactionsFor(page))
  const policy = imageCompressionPolicy(compression)
  const blob = await canvasToBlob(raster.canvas, 'image/jpeg', policy.jpegQuality)
  const jpg = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()))
  const outPage = out.addPage([raster.pageWidth, raster.pageHeight])
  outPage.drawImage(jpg, {
    x: 0,
    y: 0,
    width: raster.pageWidth,
    height: raster.pageHeight,
  })
  return outPage
}
