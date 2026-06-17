import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib'
import type { PdfImageGridCount } from '../model/model'

export type PdfImageCompressionMode = 'balanced' | 'compatibility'

export type PdfImageCompressionPolicy = {
  jpegMaxDimension: number
  jpegQuality: number
  maxLosslessPngPixels: number
}

export function imageCompressionPolicy(
  mode: PdfImageCompressionMode = 'balanced',
): PdfImageCompressionPolicy {
  if (mode === 'compatibility') {
    return {
      jpegMaxDimension: 2200,
      jpegQuality: 0.9,
      maxLosslessPngPixels: 20_000_000,
    }
  }
  return {
    jpegMaxDimension: 1600,
    jpegQuality: 0.82,
    maxLosslessPngPixels: 8_000_000,
  }
}

/** Firma de archivo PNG (‰PNG) — para embeber sin pérdida aunque falte el mime. */
export function isPngBytes(b: Uint8Array): boolean {
  return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
}

/**
 * Dimensiones de un PNG leídas del chunk IHDR (ancho/alto big-endian en los
 * bytes 16..23), SIN decodificar la imagen. `null` si no parece PNG.
 */
export function readPngSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || !isPngBytes(b)) return null
  const w = b[16]! * 0x1000000 + b[17]! * 0x10000 + b[18]! * 0x100 + b[19]!
  const h = b[20]! * 0x1000000 + b[21]! * 0x10000 + b[22]! * 0x100 + b[23]!
  return { w, h }
}

/** Decodifica un data URL `data:...;base64,...` a bytes. `null` si no es base64. */
export function dataUrlToBytes(src: string): Uint8Array | null {
  const i = src.indexOf('base64,')
  if (i < 0) return null
  const bin = atob(src.slice(i + 7))
  const out = new Uint8Array(bin.length)
  for (let j = 0; j < bin.length; j++) out[j] = bin.charCodeAt(j)
  return out
}

/**
 * Rasteriza un bitmap (ya decodificado) a un Blob JPEG sobre fondo blanco.
 *
 * El ensamblado corre en un Web Worker, donde NO existen `document`/`<canvas>`.
 * Por eso usamos `OffscreenCanvas` (disponible en workers y main thread
 * moderno); sólo si no está, caemos al `<canvas>` del DOM (main thread viejo).
 * Antes esto usaba `document.createElement('canvas')` directo → tiraba en el
 * worker y las páginas de imagen (fotos JPEG) se salteaban: el PDF no se
 * generaba aunque las imágenes están soportadas.
 */
async function rasterizeToJpeg(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    if (typeof canvas.convertToBlob === 'function') {
      return canvas.convertToBlob({ type: 'image/jpeg', quality })
    }
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) throw new Error('No se pudo codificar la imagen')
    return blob
  }
  throw new Error('No hay canvas disponible para codificar la imagen')
}

/** Re-encodea una imagen a JPEG (fondo blanco, dimensión acotada) → bytes. */
async function toJpegBytes(
  file: File,
  policy: PdfImageCompressionPolicy,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  // createImageBitmap decodifica un Blob sin necesitar `<img>`/DOM — funciona
  // en el worker y en el main thread.
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('No se pudo decodificar la imagen')
  }
  try {
    const scale = Math.min(
      1,
      policy.jpegMaxDimension / Math.max(bitmap.width, bitmap.height),
    )
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const blob = await rasterizeToJpeg(bitmap, width, height, policy.jpegQuality)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    return { bytes, width, height }
  } finally {
    bitmap.close()
  }
}

const A4: [number, number] = [595.28, 841.89]
const IMAGE_PAGE_MARGIN = 54

type ImageBox = { x: number; y: number; w: number; h: number }
type EmbeddedImage = { image: PDFImage; width: number; height: number }

async function embedImage(
  out: PDFDocument,
  file: File,
  policy: PdfImageCompressionPolicy,
): Promise<EmbeddedImage> {
  const buf = new Uint8Array(await file.arrayBuffer())
  if (file.type === 'image/png' || isPngBytes(buf)) {
    const size = readPngSize(buf)
    if (!size || size.w * size.h <= policy.maxLosslessPngPixels) {
      try {
        const png = await out.embedPng(buf)
        return { image: png, width: png.width, height: png.height }
      } catch {
        // PNG no soportado por pdf-lib → JPEG abajo.
      }
    }
  }
  const { bytes, width, height } = await toJpegBytes(file, policy)
  const jpg = await out.embedJpg(bytes)
  return { image: jpg, width, height }
}

export function fitImageInsideBox(srcW: number, srcH: number, box: ImageBox) {
  const scale = Math.min(box.w / srcW, box.h / srcH)
  const width = srcW * scale
  const height = srcH * scale
  return {
    x: box.x + (box.w - width) / 2,
    y: box.y + (box.h - height) / 2,
    width,
    height,
  }
}

export function imageGridBoxes(count: PdfImageGridCount): ImageBox[] {
  const [pageW, pageH] = A4
  const gap = 24
  const content = {
    x: IMAGE_PAGE_MARGIN,
    y: IMAGE_PAGE_MARGIN,
    w: pageW - IMAGE_PAGE_MARGIN * 2,
    h: pageH - IMAGE_PAGE_MARGIN * 2,
  }
  const cols = count === 1 ? 1 : count === 2 ? 1 : 2
  const rows = count === 1 ? 1 : count === 2 ? 2 : count === 3 || count === 4 ? 2 : 3
  const cellW = (content.w - gap * (cols - 1)) / cols
  const cellH = (content.h - gap * (rows - 1)) / rows
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols
    const rowFromTop = Math.floor(i / cols)
    return {
      x: content.x + col * (cellW + gap),
      y: content.y + (rows - 1 - rowFromTop) * (cellH + gap),
      w: cellW,
      h: cellH,
    }
  })
}

export async function addImageGridPage(
  out: PDFDocument,
  files: File[],
  options: { compression?: PdfImageCompressionMode; imagesPerPage?: PdfImageGridCount } = {},
): Promise<PDFPage> {
  const policy = imageCompressionPolicy(options.compression)
  const perPage = options.imagesPerPage ?? 1
  const p = out.addPage(A4)
  const boxes = imageGridBoxes(perPage)
  for (const [i, file] of files.slice(0, perPage).entries()) {
    const embedded = await embedImage(out, file, policy)
    p.drawImage(
      embedded.image,
      fitImageInsideBox(embedded.width, embedded.height, boxes[i]!),
    )
  }
  return p
}

/**
 * Embebe una imagen como una hoja. PNG → sin pérdida (`embedPng`, preserva
 * screenshots/line-art); el resto se re-encodea a JPEG. Si pdf-lib no soporta
 * ese PNG, cae al camino JPEG.
 */
export async function addImagePage(
  out: PDFDocument,
  file: File,
  options: { compression?: PdfImageCompressionMode } = {},
): Promise<PDFPage> {
  return addImageGridPage(out, [file], {
    compression: options.compression,
    imagesPerPage: 1,
  })
}
