import { safeFetchFollowingRedirects } from './ssrf-fetch.js'
import { RECORTE_IMAGE_MIMES } from './recortes-media.js'
import { youtubeThumbUrl, youtubeVideoId } from '../../../src/lib/youtubeThumb.js'

/**
 * Lógica de la caché de miniaturas de recortes-enlace. El servidor descarga la
 * miniatura (OG image o la derivada de YouTube) con el fetch endurecido contra
 * SSRF y la entrega como bytes + mime para guardarla en nuestro blob propio.
 *
 * Todo acá es best-effort: cualquier fallo devuelve null y el caller deja el
 * recorte como estaba (sigue mostrando la `image_url` externa o la miniatura
 * derivada en el cliente). Nada de esto bloquea ni rompe el flujo del usuario.
 */

const TIMEOUT_MS = 5000
/** Tope de bytes de la descarga: una miniatura razonable nunca pasa esto. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export type ThumbnailBytes = { bytes: ArrayBuffer; mime: string }

/**
 * Decide qué URL de miniatura cachear para un recorte:
 *   - Si el `sourceUrl` es un video de YouTube → la miniatura derivada del id
 *     (misma derivación que el cliente, helper compartido).
 *   - Si no, la `ogImage` que sacó el preview SSRF-safe (puede ser null).
 * YouTube tiene prioridad: su miniatura derivada es más estable que el og:image
 * de una página de YouTube (que a veces es un genérico del canal).
 */
export function resolveThumbnailUrl(
  sourceUrl: string | null,
  ogImage: string | null,
): string | null {
  if (sourceUrl) {
    const videoId = youtubeVideoId(sourceUrl)
    if (videoId) return youtubeThumbUrl(videoId)
  }
  return ogImage ?? null
}

/** Normaliza el content-type a un mime soportado, o null si no es imagen. */
export function imageMimeFromContentType(contentType: string | null): string | null {
  if (!contentType) return null
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return mime in RECORTE_IMAGE_MIMES ? mime : null
}

/**
 * Descarga la miniatura de `thumbUrl` de forma SSRF-safe y la valida:
 *   - solo http(s) público (lo garantiza safeFetchFollowingRedirects)
 *   - content-type image/* soportado
 *   - tamaño ≤ MAX_IMAGE_BYTES (corta el stream apenas se excede)
 * Devuelve los bytes + mime, o null ante cualquier problema. No lanza.
 */
export async function downloadThumbnail(
  thumbUrl: string,
): Promise<ThumbnailBytes | null> {
  let parsed: URL
  try {
    parsed = new URL(thumbUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await safeFetchFollowingRedirects(parsed, controller.signal, 'image/*')
    if (!res || !res.ok) return null

    const mime = imageMimeFromContentType(res.headers.get('content-type'))
    if (!mime) return null

    // Si el server declara un Content-Length pasado del tope, ni leemos.
    const declared = Number.parseInt(res.headers.get('content-length') ?? '', 10)
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null

    const reader = res.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_IMAGE_BYTES) {
        reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
    if (total === 0) return null

    const out = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      out.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { bytes: out.buffer, mime }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
