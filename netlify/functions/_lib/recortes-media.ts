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

/** Hash hex aleatorio de 16 bytes — la parte inmutable e inadivinable de la key. */
export function randomBlobName(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Escribe los bytes de una imagen en `recortes-media` bajo el namespace del
 * usuario y devuelve la `imageKey` resultante. `mime` debe ser uno de
 * RECORTE_IMAGE_MIMES (el caller valida). Mime + size quedan en metadata, como
 * el endpoint de subida — el servido los lee de ahí.
 */
export async function storeRecorteImage(
  userId: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<string> {
  const ext = RECORTE_IMAGE_MIMES[mime] ?? 'jpg'
  const key = `${userId}/${randomBlobName()}.${ext}`
  const store = getStore(RECORTES_MEDIA_STORE)
  await store.set(key, bytes, {
    metadata: { mime, size: String(bytes.byteLength) },
  })
  return key
}
