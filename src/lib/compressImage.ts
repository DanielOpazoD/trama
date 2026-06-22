/**
 * Compresión de imágenes en el cliente, SOLO cuando hace falta.
 *
 * Las funciones de Netlify topean el body de la request (~6 MB), así que una
 * foto grande (p. ej. 6.8 MB) da 500 al subir. Para imágenes que superan el
 * umbral, reescalamos al lado mayor `MAX_DIM` y re-codificamos (JPEG de calidad
 * alta) para bajar el peso sin pérdida visible significativa.
 *
 * Importante sobre la fecha: la recodificación BORRA el EXIF, así que la fecha
 * de captura se lee del archivo ORIGINAL antes de comprimir (`resolveCaptureDate`
 * en el flujo de subida) y viaja aparte como `takenAt`.
 *
 * Pasan SIN tocar: lo que no es imagen, SVG, GIF (animado), y las imágenes ya
 * por debajo del umbral. Cualquier fallo devuelve el original (la subida, en el
 * peor caso, mostrará el error de tamaño en vez de romper acá).
 */

/** Si la imagen pesa más que esto, la comprimimos antes de subir. */
const COMPRESS_THRESHOLD = 4 * 1024 * 1024
/** Lado mayor máximo del resultado (px). Conserva detalle, baja mucho el peso. */
const MAX_DIM = 3000
const JPEG_QUALITY = 0.85

export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  // SVG (vectorial) y GIF (posible animación) no se recodifican.
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file
  if (file.size <= COMPRESS_THRESHOLD) return file
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return file
  }

  let bitmap: ImageBitmap | null = null
  try {
    // `imageOrientation: 'from-image'` respeta la orientación EXIF (si no, el
    // canvas dibujaría la foto rotada).
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, width, height)

    // PNG conserva transparencia; el resto se recodifica a JPEG (mejor para fotos).
    const keepPng = file.type === 'image/png'
    const mime = keepPng ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, keepPng ? undefined : JPEG_QUALITY),
    )
    // Si no comprimió (o quedó más grande), nos quedamos con el original.
    if (!blob || blob.size >= file.size) return file

    // Conservamos el nombre si ya era JPEG; si cambió de formato, ajustamos la
    // extensión.
    const alreadyJpeg = /\.jpe?g$/i.test(file.name)
    const name =
      !keepPng && alreadyJpeg
        ? file.name
        : `${file.name.replace(/\.[^./\\]+$/, '') || 'imagen'}.${keepPng ? 'png' : 'jpg'}`

    return new File([blob], name, { type: mime, lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}
