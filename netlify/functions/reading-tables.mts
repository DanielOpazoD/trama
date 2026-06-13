import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import {
  ReadingTableCreateBody,
  ReadingTablePatchBody,
} from './_lib/reading-table-schemas.js'
import { RestoreBody } from './_lib/restore-schema.js'

/**
 * Mesas / proyectos editoriales — persistir la mesa de Flujo.
 * La mesa de Flujo vive hoy en localStorage (efímera). Esta entidad la hace
 * persistente: título + materiales elegidos (ids del inbox) + borrador
 * Markdown + estado. App-only (sin CORS de extensión). Soft-delete + restore,
 * RLS por usuario.
 */
type ReadingTableRow = {
  id: string
  title: string
  material_ids: string[]
  draft_markdown: string | null
  status: string
  created_at: string
  updated_at: string
}

export default withObservability(
  'reading-tables',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, RestoreBody, requestId)
      if (!parsed.ok) return parsed.response
      const { deletedAt } = parsed.data
      const rows = await sqlTyped<{ restored: boolean }>(sql`
        WITH restore_rt AS (
          UPDATE reading_tables SET deleted_at = NULL, updated_at = NOW()
          WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
          RETURNING 1
        )
        SELECT EXISTS (SELECT 1 FROM restore_rt) AS restored
      `)
      if (!rows[0]?.restored) {
        return ApiErrors.notFound(requestId, 'Proyecto no encontrado para restaurar')
      }
      return Response.json({ restored: true })
    }

    if (req.method === 'GET') {
      const rows = await sqlTyped<ReadingTableRow>(sql`
        SELECT id, title, material_ids, draft_markdown, status, created_at, updated_at
        FROM reading_tables
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY updated_at DESC, id DESC
        LIMIT 500
      `)
      return Response.json(rows)
    }

    if (req.method === 'POST' && !id) {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, ReadingTableCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const b = parsed.data
      const rows = await sqlTyped<ReadingTableRow>(sql`
        INSERT INTO reading_tables (title, material_ids, draft_markdown, user_id)
        VALUES (
          ${b.title},
          ${JSON.stringify(b.materialIds ?? [])}::jsonb,
          ${b.draftMarkdown ?? null},
          ${userId}
        )
        RETURNING id, title, material_ids, draft_markdown, status, created_at, updated_at
      `)
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, ReadingTablePatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const b = parsed.data
      const rows = await sqlTyped<ReadingTableRow>(sql`
        UPDATE reading_tables
        SET title = CASE WHEN ${b.title !== undefined} THEN ${b.title ?? null} ELSE title END,
            material_ids = CASE WHEN ${b.materialIds !== undefined}
              THEN ${JSON.stringify(b.materialIds ?? [])}::jsonb ELSE material_ids END,
            draft_markdown = CASE WHEN ${b.draftMarkdown !== undefined}
              THEN ${b.draftMarkdown ?? null} ELSE draft_markdown END,
            status = CASE WHEN ${b.status !== undefined} THEN ${b.status ?? null} ELSE status END,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id, title, material_ids, draft_markdown, status, created_at, updated_at
      `)
      if (rows.length === 0)
        return ApiErrors.notFound(requestId, 'Proyecto no encontrado')
      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      const rows = await sqlTyped<{ deleted_at: string }>(sql`
        UPDATE reading_tables SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING deleted_at
      `)
      return Response.json({ ok: true, deletedAt: rows[0]?.deleted_at ?? null })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: [
    '/api/reading-tables',
    '/api/reading-tables/:id',
    '/api/reading-tables/:id/restore',
  ],
}
