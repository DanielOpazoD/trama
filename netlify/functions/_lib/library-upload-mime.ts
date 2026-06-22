/**
 * Allowlist de tipos MIME y clasificación de familia para los archivos subidos a
 * la Biblioteca. Single-source compartido por las tres rutas de subida:
 *   - `library-uploads.mts`           (multipart, archivos chicos ≤4 MB)
 *   - `library-uploads-presign.mts`   (presign de R2, archivos grandes)
 *   - `library-uploads-complete.mts`  (registro del manifest tras subir a R2)
 *
 * Mantener la lista en un solo lugar evita que las tres rutas se desincronicen
 * (un mime aceptado en una y rechazado en otra). `fileTypeForMime` espeja el
 * CASE del read-model de la Biblioteca para clasificar la card por familia.
 */

/** Tope de mimes exactos permitidos (los `image/*`, `video/*`, `text/*` se
 *  validan por prefijo aparte). */
const ALLOWED_EXACT_MIMES = new Set([
  'application/pdf',
  'application/json',
  // Office (docx / xlsx / pptx + legados)
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

/** ¿Es un mime aceptado para la Biblioteca? Imágenes, videos y texto por
 *  prefijo; el resto contra la lista exacta. */
export function isAllowedLibraryMime(mime: string): boolean {
  if (mime.startsWith('image/')) return true
  if (mime.startsWith('video/')) return true
  if (mime.startsWith('text/')) return true
  return ALLOWED_EXACT_MIMES.has(mime)
}

/** Familia de archivo derivada del mime (espejo del CASE del read-model). */
export function fileTypeForMime(mime: string): string {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'text/csv'
  ) {
    return 'spreadsheet'
  }
  if (
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return 'presentation'
  }
  if (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/json' ||
    mime.startsWith('text/')
  ) {
    return 'document'
  }
  return 'other'
}
