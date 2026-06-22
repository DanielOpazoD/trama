import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logOperationalEvent } from './_lib/operational-events.js'
import { storageKeyBelongsToUser } from './_lib/legacy-identity.js'
import { createNetlifyBlobStorageAdapter } from './_lib/storage-adapter.js'

/**
 * GET /api/library-uploads-file/:userId/:key
 *
 * Sirve un blob del dominio `library-uploads` (archivos subidos directo a la
 * Biblioteca). Espeja `momentos-file` / `notas-attachments-file`:
 *
 *   - Autenticamos y exigimos que la key esté namespaceada por el userId del
 *     authed user (`${userId}/...`). Conocer la key no alcanza para leerla.
 *   - Confirmamos contra `storage_assets` que la fila existe, es del usuario, es
 *     del dominio `library-uploads` y no está soft-deleted; de ahí sacamos el
 *     mime real para el Content-Type.
 *
 * Cache-Control: private + no-store + Vary Authorization — contenido privado,
 * no debe quedar en caches compartidas.
 */
const STORE = 'library-uploads'

function readRawStorageKey(context: Context): string | null {
  const rawKey = context.params.key
  if (!rawKey) return null
  const rawUserId = context.params.userId
  return rawUserId ? `${rawUserId}/${rawKey}` : rawKey
}

export default withObservability(
  'library-uploads-file',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)

    const rawKey = readRawStorageKey(context)
    if (!rawKey) return ApiErrors.validation(requestId, 'key requerida')

    let storageKey: string
    try {
      storageKey = decodeURIComponent(rawKey)
    } catch {
      return ApiErrors.validation(requestId, 'key inválida')
    }

    const { id: userId } = await getAuthedUser(req)
    if (!storageKeyBelongsToUser(storageKey, userId)) {
      logOperationalEvent({
        event: 'blob.access.denied',
        severity: 'warn',
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        operation: 'library-upload.blob.read',
        userId,
        reason: 'storage_key_owner_mismatch',
      })
      return ApiErrors.notFound(requestId, 'No encontrado')
    }

    const sql = getSql()
    const refs = await sqlTyped<{ mime_type: string }>(sql`
      SELECT mime_type
      FROM storage_assets
      WHERE storage_key = ${storageKey}
        AND user_id = ${userId}
        AND domain = 'library-uploads'
        AND deleted_at IS NULL
    `)
    if (refs.length === 0) {
      logOperationalEvent({
        event: 'blob.access.denied',
        severity: 'warn',
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        operation: 'library-upload.blob.read',
        userId,
        reason: 'library_upload_manifest_missing',
      })
      return ApiErrors.notFound(requestId, 'No encontrado')
    }

    const blob = await createNetlifyBlobStorageAdapter(STORE).getWithMetadata<ArrayBuffer>(
      storageKey,
      'arrayBuffer',
    )
    if (!blob) return ApiErrors.notFound(requestId, 'No encontrado')

    const mime =
      typeof blob.metadata.mime === 'string'
        ? blob.metadata.mime
        : (refs[0]!.mime_type ?? 'application/octet-stream')
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
  path: [
    '/api/library-uploads-file/:key',
    '/api/library-uploads-file/:userId/:key',
  ],
}
