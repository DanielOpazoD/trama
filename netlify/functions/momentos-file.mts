import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { getSql } from './_lib/db.js'
import { queryWithUserRls } from './_lib/user-rls.js'

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

type LegacyMediaReferenceRow = {
  referenced: boolean
}

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

async function isLegacyMediaReferencedByUser(
  userId: string,
  storageKey: string,
): Promise<boolean> {
  const sql = getSql()
  const rows = await queryWithUserRls<LegacyMediaReferenceRow>(sql, userId, (scoped) => scoped`
    SELECT EXISTS (
      SELECT 1
      FROM momentos
      WHERE user_id = ${userId}
        AND kind = 'foto'
        AND deleted_at IS NULL
        AND (
          payload->>'storageKey' = ${storageKey}
          OR payload->>'audioKey' = ${storageKey}
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(payload->'items') = 'array' THEN payload->'items'
                ELSE '[]'::jsonb
              END
            ) item
            WHERE item->>'storageKey' = ${storageKey}
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(payload->'photos') = 'array' THEN payload->'photos'
                ELSE '[]'::jsonb
              END
            ) photo
            WHERE photo->>'storageKey' = ${storageKey}
          )
        )
    ) AS referenced
  `)
  return rows[0]?.referenced === true
}

async function canReadStorageKey(userId: string, key: string): Promise<boolean> {
  const slashIdx = key.indexOf('/')
  if (slashIdx > 0) {
    const keyUserId = key.slice(0, slashIdx)
    if (keyUserId === userId) return true
    if (keyUserId !== LEGACY_USER_ID) return false
    return isLegacyMediaReferencedByUser(userId, key)
  }

  if (userId === LEGACY_USER_ID) return true
  return isLegacyMediaReferencedByUser(userId, key)
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

    // Autorización por path:
    // - Keys nuevas: el primer segmento debe coincidir con el userId.
    // - Keys legacy: el usuario legacy puede leerlas directo; otros usuarios
    //   solo si un Momento foto activo suyo referencia exactamente esa key.
    if (!(await canReadStorageKey(userId, key))) {
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
