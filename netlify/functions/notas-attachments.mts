import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { attachmentOwnerExists } from './_lib/notas-attachment-owners.js'

type AttachmentRow = {
  id: string
  owner_type: 'note' | 'prompt'
  owner_id: string
  file_name: string
  mime_type: string
  byte_size: number
  storage_key: string
  created_at: string
  updated_at: string
}

export default withObservability(
  'notas-attachments',
  async (req: Request, context: Context, { requestId }) => {
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const ownerType = url.searchParams.get('ownerType')
      const ownerId = url.searchParams.get('ownerId')
      if (ownerType !== 'note' && ownerType !== 'prompt') {
        return ApiErrors.validation(requestId, 'ownerType debe ser note o prompt')
      }
      if (!ownerId) return ApiErrors.validation(requestId, 'ownerId requerido')
      if (!(await attachmentOwnerExists(sql, ownerType, ownerId, userId))) {
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
      await sql`
        UPDATE notas_attachments SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `
      return Response.json({ ok: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/notas-attachments', '/api/notas-attachments/:id'],
}
