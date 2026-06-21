import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logOperationalEvent } from './_lib/operational-events.js'
import { storageKeyBelongsToUser } from './_lib/legacy-identity.js'

const STORE = 'notas-attachments'

function readRawStorageKey(context: Context): string | null {
  const rawKey = context.params.key
  if (!rawKey) return null
  const rawUserId = context.params.userId
  return rawUserId ? `${rawUserId}/${rawKey}` : rawKey
}

export default withObservability(
  'notas-attachments-file',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)

    const rawKey = readRawStorageKey(context)
    if (!rawKey) return ApiErrors.validation(requestId, 'key requerida')
    const storageKey = decodeURIComponent(rawKey)
    const { id: userId } = await getAuthedUser(req)
    if (!storageKeyBelongsToUser(storageKey, userId)) {
      logOperationalEvent({
        event: 'blob.access.denied',
        severity: 'warn',
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        operation: 'attachment.blob.read',
        userId,
        reason: 'storage_key_owner_mismatch',
      })
      return ApiErrors.notFound(requestId, 'No encontrado')
    }

    const sql = getSql()
    const refs = await sqlTyped<{ file_name: string; mime_type: string }>(sql`
      SELECT file_name, mime_type
      FROM notas_attachments
      WHERE storage_key = ${storageKey}
        AND user_id = ${userId}
        AND deleted_at IS NULL
    `)
    if (refs.length === 0) {
      logOperationalEvent({
        event: 'blob.access.denied',
        severity: 'warn',
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        operation: 'attachment.blob.read',
        userId,
        reason: 'attachment_blob_metadata_missing',
      })
      return ApiErrors.notFound(requestId, 'No encontrado')
    }

    const blob = await getStore(STORE).getWithMetadata(storageKey, {
      type: 'arrayBuffer',
    })
    if (!blob) return ApiErrors.notFound(requestId, 'No encontrado')

    const ref = refs[0]!
    return new Response(blob.data, {
      headers: {
        'Content-Type': ref.mime_type,
        'Content-Disposition': `attachment; filename="${ref.file_name.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
        Vary: 'Authorization',
      },
    })
  },
)

export const config: Config = {
  path: ['/api/notas-attachments-file/:key', '/api/notas-attachments-file/:userId/:key'],
}
