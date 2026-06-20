import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logOperationalEvent } from './_lib/operational-events.js'

/**
 * GET /api/recortes-image/:key
 * GET /api/recortes-image/:userId/:key
 *
 * Sirve un blob de "recortes-media" como imagen. Solo expone mime + bytes.
 *
 * Autorización: las imageKey nuevas tienen formato `${userId}/${hash}.${ext}`
 * (ver recortes-image-upload.mts). A diferencia de los momentos, los recortes
 * NO se comparten entre usuarios (no hay spaces), así que la autorización es
 * un simple match del prefijo: el primer segmento del path debe coincidir con
 * el usuario autenticado. No hay keys legacy: image_key nació en esta tanda.
 *
 * Cache-Control: private + no-store — contenido privado del usuario, fuera de
 * cualquier caché compartida o CDN.
 */

function decodeStorageKey(rawKey: string): string | null {
  try {
    return decodeURIComponent(rawKey)
  } catch {
    return null
  }
}

function readRawStorageKey(context: Context): string | null {
  const rawKey = context.params.key
  if (!rawKey) return null
  const rawUserId = context.params.userId
  return rawUserId ? `${rawUserId}/${rawKey}` : rawKey
}

export default withObservability(
  'recortes-image',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method !== 'GET') {
      return ApiErrors.methodNotAllowed(requestId)
    }
    const rawKey = readRawStorageKey(context)
    if (!rawKey) return ApiErrors.validation(requestId, 'key requerida')

    const key = decodeStorageKey(rawKey)
    if (!key) return ApiErrors.validation(requestId, 'key inválida')

    const { id: userId } = await getAuthedUser(req)

    // El primer segmento del path debe ser el userId. Sin "/" o con prefijo
    // ajeno → 404 (no filtramos existencia: misma respuesta que key inexistente).
    const slashIdx = key.indexOf('/')
    if (slashIdx <= 0 || key.slice(0, slashIdx) !== userId) {
      logOperationalEvent({
        event: 'blob.access.denied',
        severity: 'warn',
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        operation: 'recorte.blob.read',
        userId,
        reason: 'storage_key_owner_mismatch',
      })
      return ApiErrors.notFound(requestId, 'No encontrado')
    }

    const store = getStore('recortes-media')
    const blob = await store.getWithMetadata(key, { type: 'arrayBuffer' })
    if (!blob) {
      return ApiErrors.notFound(requestId, 'No encontrado')
    }
    const mime =
      typeof blob.metadata.mime === 'string' ? blob.metadata.mime : 'image/jpeg'
    return new Response(blob.data, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, no-store',
        Vary: 'Authorization',
      },
    })
  },
)

export const config: Config = {
  path: ['/api/recortes-image/:key', '/api/recortes-image/:userId/:key'],
}
