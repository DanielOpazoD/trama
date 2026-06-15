import { getStore } from '@netlify/blobs'

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
 * Copia el blob de la imagen de un recorte (`recortes-media`) al store
 * `momentos-media`, devolviendo la nueva storageKey con namespace por usuario
 * (`${userId}/${random}.${ext}`) y el mime preservado. Devuelve `null` si el
 * blob origen no existe (captura sin imagen real → no se puede promover a foto).
 */
export async function copyRecorteImageToMomentos(
  imageKey: string,
  userId: string,
): Promise<{ storageKey: string; mime: string } | null> {
  const source = getStore('recortes-media')
  const blob = await source.getWithMetadata(imageKey, { type: 'arrayBuffer' })
  if (!blob) return null

  const mime = typeof blob.metadata.mime === 'string' ? blob.metadata.mime : 'image/jpeg'
  const buffer = blob.data
  const storageKey = `${userId}/${randomKey()}.${extFromMime(mime)}`

  const dest = getStore('momentos-media')
  await dest.set(storageKey, buffer, {
    metadata: { mime, size: String(buffer.byteLength) },
  })

  return { storageKey, mime }
}
