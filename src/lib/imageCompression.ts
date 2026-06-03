/**
 * Compresión de imágenes en el cliente, antes de subirlas. Reduce el peso final
 * (re-encode a WebP + cap de dimensión) sin comprometer mucho la calidad, así no
 * mandamos al backend un JPEG de 8 MB de la cámara del teléfono.
 *
 * Es best-effort y defensivo: si el navegador no soporta `createImageBitmap`/
 * canvas, o el formato no conviene re-encodear (GIF, que puede ser animado), o
 * el "comprimido" no pesa menos, devuelve el File original. NUNCA lanza — el
 * upload no debe romperse por esto.
 */

/** Lado máximo (px). Fotos más grandes se reescalan manteniendo proporción. */
const MAX_EDGE = 2200
/** Calidad WebP (0–1). 0.82 ≈ buen balance peso/calidad para fotos. */
const QUALITY = 0.82
/** Tipos que conviene re-encodear. GIF queda fuera (puede ser animado). */
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp'])

function fit(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h }
  const scale = max / Math.max(w, h)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality))
}

export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type)) return file
  // createImageBitmap está en todos los navegadores modernos; si falta, no
  // comprimimos (subimos el original) en vez de arriesgar un fallback frágil.
  if (typeof createImageBitmap !== 'function') return file

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    if (!bitmap.width || !bitmap.height) return file
    const { width, height } = fit(bitmap.width, bitmap.height, MAX_EDGE)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await toBlob(canvas, 'image/webp', QUALITY)
    // Sin blob, o si el "comprimido" pesa igual o más → quedamos con el original.
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp'
    return new File([blob], name, { type: 'image/webp', lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}
