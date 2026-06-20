import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { attachmentOwnerExists } from './_lib/notas-attachment-owners.js'
import { parseSearchParams, QueryParam } from './_lib/request-contracts.js'
import { z } from 'zod'
import { logOperationalEvent } from './_lib/operational-events.js'

type AttachmentRow = {
  id: string
  owner_type: 'note' | 'prompt' | 'week' | 'task'
  owner_id: string
  file_name: string
  mime_type: string
  byte_size: number
  storage_key: string
  created_at: string
  updated_at: string
}

const AttachmentOwnerQuery = z.object({
  ownerType: z.enum(['note', 'prompt', 'week', 'task']),
  ownerId: z.preprocess(
    QueryParam.trimmedString({ max: 200 }).normalize,
    z.string().min(1).max(200),
  ),
})

export default withObservability(
  'notas-attachments',
  async (req: Request, context: Context, { requestId }) => {
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'GET') {
      const parsedQuery = parseSearchParams(req, AttachmentOwnerQuery, requestId)
      if (!parsedQuery.ok) return parsedQuery.response
      const { ownerType, ownerId } = parsedQuery.data
      if (!(await attachmentOwnerExists(sql, ownerType, ownerId, userId))) {
        logOperationalEvent({
          event: 'owner.mismatch',
          severity: 'warn',
          requestId,
          method: req.method,
          path: new URL(req.url).pathname,
          operation: 'attachment.owner.read',
          userId,
          reason: 'attachment_owner_not_visible',
          details: { ownerType, ownerId },
        })
        return ApiErrors.notFound(requestId, 'Destino no encontrado')
      }

      const rows = await sqlTyped<AttachmentRow>(sql`
        SELECT id, owner_type, owner_id, file_name, mime_type, byte_size, storage_key, created_at, updated_at
        FROM notas_attachments
        WHERE deleted_at IS NULL
          AND user_id = ${userId}
          AND owner_type = ${ownerType}
          AND owner_id = ${ownerId}
        ORDER BY created_at DESC, id DESC
      `)
      return Response.json(rows)
    }

    if (req.method === 'DELETE' && id) {
      const rows = await sqlTyped<{ id: string }>(sql`
        UPDATE notas_attachments SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id
      `)
      if (rows.length === 0) {
        logOperationalEvent({
          event: 'owner.mismatch',
          severity: 'warn',
          requestId,
          method: req.method,
          path: new URL(req.url).pathname,
          operation: 'attachment.delete',
          userId,
          reason: 'attachment_not_visible',
          details: { id },
        })
        logOperationalEvent({
          event: 'blob.access.denied',
          severity: 'warn',
          requestId,
          method: req.method,
          path: new URL(req.url).pathname,
          operation: 'attachment.delete',
          userId,
          reason: 'attachment_delete_not_visible',
          details: { id },
        })
        return ApiErrors.notFound(requestId, 'Anexo no encontrado')
      }
      return Response.json({ ok: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/notas-attachments', '/api/notas-attachments/:id'],
}
