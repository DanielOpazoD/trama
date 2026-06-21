import { createNetlifyBlobStorageAdapter } from './storage-adapter.js'

/**
 * Promoción de una captura de imagen a un Momento foto: copia del blob entre
 * stores de Netlify Blobs.
 *
 * Una captura (recorte) guarda su imagen en el store `recortes-media` y la
 * sirve `/api/recortes-image`. Un Momento foto, en cambio, lee su imagen de
 * `momentos-media` vía `/api/momentos-file` —que además exige que la storageKey
 * esté referenciada por un momento foto activo (canReadStorageKey)—. Por eso
 * NO alcanza con copiar la `image_key` del recorte al payload: viviría en el
 * store equivocado y daría 404. Hay que COPIAR el blob a `momentos-media`.
 *
 * El cliente no puede tocar `@netlify/blobs` (regla de AGENTS.md), así que la
 * copia ocurre server-side, en el handler de promoción de `recortes.mts`.
 */

/** Extensión por MIME (mismo set que momentos-upload / recortes-image-upload). */
function extFromMime(mime: string): string {
  const base = mime.split(';')[0]!.trim().toLowerCase()
  if (base === 'image/png') return 'png'
  if (base === 'image/webp') return 'webp'
  if (base === 'image/gif') return 'gif'
  return 'jpg'
}

/** Key aleatoria (hex de 16 bytes), igual patrón que los demás uploads. */
function randomKey(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Borra un blob de un store (best-effort, traga el error). Se usa para limpiar
 * copias huérfanas cuando una reclasificación/promoción de varias imágenes falla
 * a media tanda: las que ya se copiaron no deben quedar como basura en el store
 * destino si el conjunto no se completó.
 */
export async function removeBlob(storeName: string, key: string): Promise<void> {
  try {
    await createNetlifyBlobStorageAdapter(storeName).delete(key)
  } catch {
    // best-effort: si la limpieza falla, queda un huérfano (no rompe el flujo).
  }
}

/**
 * Copia el blob de la imagen de un recorte (`recortes-media`) a OTRO store,
 * devolviendo la nueva storageKey con namespace por usuario
 * (`${userId}/${random}.${ext}`), el mime preservado y el tamaño en bytes.
 * Devuelve `null` si el blob origen no existe.
 *
 * Genérico para reusarse al reclasificar una captura: a `momentos-media` (→
 * Momento foto) o a `notas-attachments` (→ Nota con imágenes), sin que el
 * cliente toque Blobs (regla de AGENTS.md).
 */
export async function copyRecorteImageToStore(
  destStoreName: string,
  imageKey: string,
  userId: string,
): Promise<{ storageKey: string; mime: string; size: number } | null> {
  const source = createNetlifyBlobStorageAdapter('recortes-media')
  const blob = await source.getWithMetadata<ArrayBuffer>(imageKey, 'arrayBuffer')
  if (!blob) return null

  const mime = typeof blob.metadata.mime === 'string' ? blob.metadata.mime : 'image/jpeg'
  const buffer = blob.data
  const storageKey = `${userId}/${randomKey()}.${extFromMime(mime)}`

  const dest = createNetlifyBlobStorageAdapter(destStoreName)
  await dest.put(storageKey, buffer, {
    mime,
    size: String(buffer.byteLength),
  })

  return { storageKey, mime, size: buffer.byteLength }
}

/**
 * Copia el blob de la imagen de un recorte al store `momentos-media` (promoción
 * a Momento foto). Envoltorio fino sobre `copyRecorteImageToStore`.
 */
export async function copyRecorteImageToMomentos(
  imageKey: string,
  userId: string,
): Promise<{ storageKey: string; mime: string } | null> {
  const copied = await copyRecorteImageToStore('momentos-media', imageKey, userId)
  return copied ? { storageKey: copied.storageKey, mime: copied.mime } : null
}
