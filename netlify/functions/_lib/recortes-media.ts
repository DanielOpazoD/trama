import { getStore } from '@netlify/blobs'

/**
 * Helpers compartidos del store de blobs `recortes-media`.
 *
 * El store y el esquema de keys (`${userId}/${hash}.${ext}`) nacieron en
 * `recortes-image-upload.mts` para las imágenes que sube la extensión. La caché
 * de miniaturas (`recortes-thumbnail-cache`) escribe en el MISMO store con el
 * MISMO esquema, así el endpoint que sirve (`recortes-image.mts`) autoriza
 * ambos por igual (match del prefijo `userId/`). Nada de keys legacy sin slash.
 */

export const RECORTES_MEDIA_STORE = 'recortes-media'

/** Tipos de imagen que aceptamos guardar (los que sabemos servir + extensión). */
export const RECORTE_IMAGE_MIMES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Tipos de video livianos que aceptamos como captura en Recortes. */
export const RECORTE_VIDEO_MIMES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

export const RECORTE_MEDIA_MIMES: Record<string, string> = {
  ...RECORTE_IMAGE_MIMES,
  ...RECORTE_VIDEO_MIMES,
}

/** Hash hex aleatorio de 16 bytes — la parte inmutable e inadivinable de la key. */
export function randomBlobName(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Escribe los bytes de un medio en `recortes-media` bajo el namespace del
 * usuario y devuelve la `imageKey` resultante. `mime` debe ser uno de
 * RECORTE_MEDIA_MIMES (el caller valida). Mime + size quedan en metadata, como
 * el endpoint de subida — el servido los lee de ahí.
 */
export async function storeRecorteMedia(
  userId: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<string> {
  const ext = RECORTE_MEDIA_MIMES[mime] ?? 'bin'
  const key = `${userId}/${randomBlobName()}.${ext}`
  const store = getStore(RECORTES_MEDIA_STORE)
  await store.set(key, bytes, {
    metadata: { mime, size: String(bytes.byteLength) },
  })
  return key
}

export const storeRecorteImage = storeRecorteMedia
