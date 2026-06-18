import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors, ApiSuccess } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import {
  SavedQueryCreate,
  SavedQueryDelete,
  SavedQueryPatch,
  toSavedQueryDTO,
  type SavedQueryRow,
} from './_lib/saved-queries.js'

/**
 * CRUD de consultas guardadas (Fase 4). `/api/saved-queries`:
 *   GET    → lista las consultas vivas del usuario (fijadas primero)
 *   POST   → crea una (valida el AST con QueryBody)
 *   PATCH  → actualiza parcialmente (COALESCE: sólo los campos presentes)
 *   DELETE → soft-delete (UPDATE deleted_at)
 *
 * Todo parametrizado y bajo RLS (`getSql()`): cada usuario sólo ve/toca lo
 * suyo. El AST guardado es el mismo shape que ejecuta /api/query.
 */
export default withObservability(
  'saved-queries',
  async (req: Request, _ctx, { requestId }) => {
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    if (req.method === 'GET') {
      const rows = await sqlTyped<SavedQueryRow>(sql`
        SELECT id, name, description, query, pinned, created_at, updated_at
        FROM saved_queries
        WHERE user_id = ${userId} AND deleted_at IS NULL
        ORDER BY pinned DESC, created_at DESC
      `)
      return Response.json({ items: rows.map(toSavedQueryDTO) })
    }

    if (req.method === 'POST') {
      // Escribimos filas con user_id → aseguramos la fila de users (FK) por si
      // es el primer login real.
      await ensureUserRow(sql, { id: userId })
      const parsed = await parseJsonBody(req, SavedQueryCreate, requestId)
      if (!parsed.ok) return parsed.response
      const { name, description, query, pinned } = parsed.data
      const rows = await sqlTyped<SavedQueryRow>(sql`
        INSERT INTO saved_queries (user_id, name, description, query, pinned)
        VALUES (
          ${userId}, ${name}, ${description ?? null},
          ${JSON.stringify(query)}::jsonb, ${pinned ?? false}
        )
        RETURNING id, name, description, query, pinned, created_at, updated_at
      `)
      return Response.json(toSavedQueryDTO(rows[0]!), { status: 201 })
    }

    if (req.method === 'PATCH') {
      const parsed = await parseJsonBody(req, SavedQueryPatch, requestId)
      if (!parsed.ok) return parsed.response
      const { id, name, description, query, pinned } = parsed.data
      // COALESCE: un campo omitido (→ null acá) conserva el valor actual.
      const rows = await sqlTyped<SavedQueryRow>(sql`
        UPDATE saved_queries SET
          name = COALESCE(${name ?? null}, name),
          description = COALESCE(${description ?? null}, description),
          query = COALESCE(${query ? JSON.stringify(query) : null}::jsonb, query),
          pinned = COALESCE(${pinned ?? null}, pinned),
          updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id, name, description, query, pinned, created_at, updated_at
      `)
      if (!rows[0]) {
        return ApiErrors.notFound(requestId, 'Consulta guardada no encontrada')
      }
      return Response.json(toSavedQueryDTO(rows[0]))
    }

    if (req.method === 'DELETE') {
      const parsed = await parseJsonBody(req, SavedQueryDelete, requestId)
      if (!parsed.ok) return parsed.response
      const rows = await sqlTyped<{ id: string }>(sql`
        UPDATE saved_queries SET deleted_at = NOW()
        WHERE id = ${parsed.data.id} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id
      `)
      if (rows.length === 0) {
        return ApiErrors.notFound(requestId, 'Consulta guardada no encontrada')
      }
      return ApiSuccess.noContent()
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: '/api/saved-queries',
}
