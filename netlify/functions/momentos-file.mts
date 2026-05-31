import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * GET /api/momentos-file/:key
 * GET /api/momentos-file/:userId/:key
 *
 * Sirve un blob de "momentos-media" como respuesta de imagen. Solo expone
 * mime type + bytes — los metadatos extra (EXIF, etc.) viven en el blob
 * pero no se devuelven al cliente.
 *
 * Autorización (multi-user prep):
 *   - Keys nuevas tienen formato `${userId}/${hash}.${ext}` (ver
 *     momentos-upload.mts).
 *   - Siempre autenticamos y verificamos que el userId del path coincide
 *     con el authed user antes de servir. Sin esto, conocer la storageKey
 *     daría acceso sin importar quién la subió.
 *   - Keys legacy (sin "/" — solo hash.ext) pertenecen al usuario legacy:
 *     se sirven solo si el usuario autenticado resuelve a `legacy-single-user`.
 *
 * Cache-Control: public + immutable. La key incluye userId + random hash;
 * nunca se sobreescribe. El "public" es seguro porque la autorización
 * pasa por el path, no por cookies — un CDN nunca verá una request sin
 * el userId correcto en la URL.
 */
const LEGACY_USER_ID = 'legacy-single-user'

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
  'momentos-file',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method !== 'GET') {
      return ApiErrors.methodNotAllowed(requestId)
    }
    const rawKey = readRawStorageKey(context)
    if (!rawKey) return ApiErrors.validation(requestId, 'key requerida')

    const key = decodeStorageKey(rawKey)
    if (!key) return ApiErrors.validation(requestId, 'key inválida')

    const { id: userId } = await getAuthedUser(req)

    // Autorización por path: si la key tiene formato user/hash.ext,
    // el primer segmento es el userId y debe coincidir con el authed.
    const slashIdx = key.indexOf('/')
    if (slashIdx > 0) {
      const keyUserId = key.slice(0, slashIdx)
      if (keyUserId !== userId) {
        // No leakeamos si existe o no — devolvemos notFound igual.
        return ApiErrors.notFound(requestId, 'No encontrado')
      }
    } else if (userId !== LEGACY_USER_ID) {
      // Legacy blobs pre-Clerk no llevan namespace; solo el owner legacy
      // debe poder leerlos durante el cutover.
      return ApiErrors.notFound(requestId, 'No encontrado')
    }

    const store = getStore('momentos-media')
    const blob = await store.getWithMetadata(key, { type: 'arrayBuffer' })
    if (!blob) {
      return ApiErrors.notFound(requestId, 'No encontrado')
    }
    const mime =
      typeof blob.metadata.mime === 'string' ? blob.metadata.mime : 'image/jpeg'
    return new Response(blob.data, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  },
)

// υ-bugfix: el path antes era `/api/momentos/file/:key` que ALGUNOS
// browsers podrían matchear contra `/api/momentos/:id` antes (Netlify
// probablemente lo resolvía bien por la sub-ruta /file/:key, pero ya
// que renombramos los otros endpoints para evitar la colisión con :id,
// uniformamos a `momentos-file` por consistencia y para reducir riesgo
// de cualquier ambigüedad futura del router.
export const config: Config = {
  path: ['/api/momentos-file/:key', '/api/momentos-file/:userId/:key'],
}
