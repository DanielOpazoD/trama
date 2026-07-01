import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib'
import type { DocSettings, PdfPage as PdfModelPage, PdfSource } from '../model/model'

export type PdfImageCompressionMode = 'balanced' | 'compatibility'

export type PdfImageCompressionPolicy = {
  jpegMaxDimension: number
  jpegQuality: number
  maxLosslessPngPixels: number
}

export type PdfImagePageCell = {
  x: number
  y: number
  width: number
  height: number
}

const PRINT_SHEET = {
  width: 595.28,
  height: 841.89,
  margin: 54,
} as const

const ALLOWED_IMAGES_PER_PAGE = [1, 2, 3, 4, 6] as const

export function resolveImagesPerPage(
  settings: DocSettings | undefined,
): 1 | 2 | 3 | 4 | 6 {
  const value = settings?.imageLayout?.imagesPerPage
  return ALLOWED_IMAGES_PER_PAGE.includes(
    value as (typeof ALLOWED_IMAGES_PER_PAGE)[number],
  )
    ? (value as 1 | 2 | 3 | 4 | 6)
    : 1
}

function gridFor(imagesPerPage: 1 | 2 | 3 | 4 | 6): { cols: number; rows: number } {
  if (imagesPerPage === 1) return { cols: 1, rows: 1 }
  if (imagesPerPage === 2) return { cols: 1, rows: 2 }
  if (imagesPerPage === 3) return { cols: 1, rows: 3 }
  if (imagesPerPage === 4) return { cols: 2, rows: 2 }
  return { cols: 2, rows: 3 }
}

function imagePageCells(imagesPerPage: 1 | 2 | 3 | 4 | 6): PdfImagePageCell[] {
  const { cols, rows } = gridFor(imagesPerPage)
  const gap = imagesPerPage === 1 ? 0 : 18
  const usableW = PRINT_SHEET.width - PRINT_SHEET.margin * 2
  const usableH = PRINT_SHEET.height - PRINT_SHEET.margin * 2
  const cellW = (usableW - gap * (cols - 1)) / cols
  const cellH = (usableH - gap * (rows - 1)) / rows
  return Array.from({ length: imagesPerPage }, (_, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    return {
      x: PRINT_SHEET.margin + col * (cellW + gap),
      y: PRINT_SHEET.height - PRINT_SHEET.margin - (row + 1) * cellH - row * gap,
      width: cellW,
      height: cellH,
    }
  })
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

async function embedImageForPdfPage(
  out: PDFDocument,
  file: File,
  policy: PdfImageCompressionPolicy,
): Promise<{ image: PDFImage; width: number; height: number }> {
  const buf = new Uint8Array(await file.arrayBuffer())
  if (file.type === 'image/png' || isPngBytes(buf)) {
    const size = readPngSize(buf)
    if (!size || size.w * size.h <= policy.maxLosslessPngPixels) {
      try {
        const image = await out.embedPng(buf)
        return { image, width: image.width, height: image.height }
      } catch {
        // PNG no soportado por pdf-lib → JPEG abajo.
      }
    }
  }
  const { bytes, width, height } = await toJpegBytes(file, policy)
  const image = await out.embedJpg(bytes)
  return { image, width, height }
}

function containImageInCell(
  image: { width: number; height: number },
  cell: PdfImagePageCell,
): PdfImagePageCell {
  const scale = Math.min(cell.width / image.width, cell.height / image.height)
  const width = image.width * scale
  const height = image.height * scale
  return {
    x: cell.x + (cell.width - width) / 2,
    y: cell.y + (cell.height - height) / 2,
    width,
    height,
  }
}

export async function addImageSheetPage({
  out,
  entries,
  imagesPerPage,
  compression,
  onImageDrawn,
}: {
  out: PDFDocument
  entries: Array<{ source: PdfSource; page: PdfModelPage }>
  imagesPerPage: 1 | 2 | 3 | 4 | 6
  compression?: PdfImageCompressionMode
  onImageDrawn?: (
    outPage: PDFPage,
    entry: { source: PdfSource; page: PdfModelPage },
    cell: PdfImagePageCell,
  ) => Promise<void>
}): Promise<PDFPage | null> {
  const policy = imageCompressionPolicy(compression)
  const outPage = out.addPage([PRINT_SHEET.width, PRINT_SHEET.height])
  const cells = imagePageCells(imagesPerPage)
  let drawn = 0
  for (const [index, entry] of entries.entries()) {
    const cell = cells[index]
    if (!cell) continue
    const embedded = await embedImageForPdfPage(out, entry.source.file, policy)
    const rect = containImageInCell(embedded, cell)
    outPage.drawImage(embedded.image, rect)
    drawn += 1
    await onImageDrawn?.(outPage, entry, rect)
  }
  return drawn > 0 ? outPage : null
}
