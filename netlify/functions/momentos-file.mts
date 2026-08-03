import type { Config, Context } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { getSql } from './_lib/db.js'
import {
  resolveStorageKeyOwner,
  storageKeyBelongsToUser,
} from './_lib/legacy-identity.js'
import { runWithSystemRls } from './_lib/user-rls.js'
import { createNetlifyBlobStorageAdapter } from './_lib/storage-adapter.js'
import { presignGet } from './_lib/r2.js'
import { isR2MomentoKey } from './_lib/momentos-media-mime.js'

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
 * Cache-Control: private + no-store. Aunque la key incluya userId + random
 * hash, estos bytes son contenido privado de un usuario. No deben quedar en
 * caches compartidas ni sobrevivir como respuestas publicas de CDN.
 */
type MediaReferenceRow = {
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

async function isMediaReferencedByReadableMomento(
  userId: string,
  storageKey: string,
): Promise<boolean> {
  const sql = getSql()
  const rows = (await runWithSystemRls(
    () => sql`
    SELECT EXISTS (
      SELECT 1
      FROM momentos m
      LEFT JOIN momento_space_access msa
        ON msa.owner_user_id = m.user_id
       AND msa.member_user_id = ${userId}
       AND msa.deleted_at IS NULL
      WHERE (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
        AND m.kind = 'foto'
        AND m.deleted_at IS NULL
        AND (
          m.payload->>'storageKey' = ${storageKey}
          OR m.payload->>'audioKey' = ${storageKey}
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(m.payload->'items') = 'array' THEN m.payload->'items'
                ELSE '[]'::jsonb
              END
            ) item
            -- posterStorageKey: el póster de un clip es un blob propio; sin esta
            -- rama, el miembro de un espacio compartido vería la miniatura rota
            -- (404) aunque sí pueda reproducir el video.
            WHERE item->>'storageKey' = ${storageKey}
               OR item->>'posterStorageKey' = ${storageKey}
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE
                WHEN jsonb_typeof(m.payload->'photos') = 'array' THEN m.payload->'photos'
                ELSE '[]'::jsonb
              END
            ) photo
            WHERE photo->>'storageKey' = ${storageKey}
          )
      )
    ) AS referenced
  `,
  )) as MediaReferenceRow[]
  return rows[0]?.referenced === true
}

async function canReadStorageKey(userId: string, key: string): Promise<boolean> {
  const keyOwner = resolveStorageKeyOwner(key)
  if (keyOwner.format === 'scoped') {
    if (storageKeyBelongsToUser(key, userId)) return true
    return isMediaReferencedByReadableMomento(userId, key)
  }

  if (storageKeyBelongsToUser(key, userId, { allowLegacyUnscopedForLegacyUser: true })) {
    return true
  }
  return isMediaReferencedByReadableMomento(userId, key)
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

    // Media grande en R2 (videos, sobre todo): firmamos un GET presignado y
    // redirigimos en vez de pasar el stream por la función — el objeto puede
    // pesar cientos de MB. La URL firmada lleva su propia auth en el query
    // string, así que el bearer que se cae cross-origin no hace falta.
    //
    // El origen se decide por la PROPIA key (ver `_lib/momentos-media-mime.ts`),
    // no consultando la base: esto es camino caliente — se ejecuta una vez por
    // cada miniatura del álbum.
    if (isR2MomentoKey(key)) {
      const signedUrl = await presignGet(key)
      return new Response(null, {
        status: 302,
        headers: {
          Location: signedUrl,
          'Cache-Control': 'private, no-store',
        },
      })
    }

    const blob = await createNetlifyBlobStorageAdapter(
      'momentos-media',
    ).getWithMetadata<ArrayBuffer>(key, 'arrayBuffer')
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

// υ-bugfix: el path antes era `/api/momentos/file/:key` que ALGUNOS
// browsers podrían matchear contra `/api/momentos/:id` antes (Netlify
// probablemente lo resolvía bien por la sub-ruta /file/:key, pero ya
// que renombramos los otros endpoints para evitar la colisión con :id,
// uniformamos a `momentos-file` por consistencia y para reducir riesgo
// de cualquier ambigüedad futura del router.
export const config: Config = {
  path: ['/api/momentos-file/:key', '/api/momentos-file/:userId/:key'],
}
