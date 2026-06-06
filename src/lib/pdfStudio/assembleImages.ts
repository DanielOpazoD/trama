import type { PDFDocument, PDFPage } from 'pdf-lib'

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

/** Re-encodea una imagen a JPEG (fondo blanco, dimensión acotada) → bytes. */
async function toJpegBytes(
  file: File,
  policy: PdfImageCompressionPolicy,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const blobUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('No se pudo decodificar la imagen'))
      el.src = blobUrl
    })
    const scale = Math.min(
      1,
      policy.jpegMaxDimension / Math.max(img.naturalWidth, img.naturalHeight),
    )
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas no disponible')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', policy.jpegQuality),
    )
    if (!blob) throw new Error('No se pudo codificar la imagen')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    return { bytes, width, height }
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
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
  const policy = imageCompressionPolicy(options.compression)
  const buf = new Uint8Array(await file.arrayBuffer())
  if (file.type === 'image/png' || isPngBytes(buf)) {
    const size = readPngSize(buf)
    if (!size || size.w * size.h <= policy.maxLosslessPngPixels) {
      try {
        const png = await out.embedPng(buf)
        const p = out.addPage([png.width, png.height])
        p.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height })
        return p
      } catch {
        // PNG no soportado por pdf-lib → JPEG abajo.
      }
    }
  }
  const { bytes, width, height } = await toJpegBytes(file, policy)
  const jpg = await out.embedJpg(bytes)
  const p = out.addPage([width, height])
  p.drawImage(jpg, { x: 0, y: 0, width, height })
  return p
}
