import type { Recorte } from '../../api'
import { recorteImageUrl } from '../../api/recortes'

export type RecorteImageEntry = { url: string; caption: string }

/**
 * Entradas del visor (lightbox) de UN recorte: una por imagen propia.
 * - Recorte-evento → todas sus imágenes (`images[]`, blobs authed).
 * - Recorte legacy de una sola imagen → su única imagen.
 * - Recorte con imagen externa (OG) → esa URL.
 * - Sin imagen propia → vacío.
 *
 * Fuente única de verdad compartida entre la tarjeta (RecorteCard) y cualquier
 * otro consumidor, para no duplicar el mapeo `images[]`/`imageUrl` → entries.
 */
export function recorteToLightboxEntries(r: Recorte): RecorteImageEntry[] {
  const caption = r.sourceTitle ?? r.text
  if (r.images.length > 0) {
    return r.images.map((img) => ({ url: recorteImageUrl(img.storageKey), caption }))
  }
  return r.imageUrl ? [{ url: r.imageUrl, caption }] : []
}
