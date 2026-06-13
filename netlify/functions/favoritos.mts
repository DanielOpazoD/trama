import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { FavoritoCreateBody, FavoritoPatchBody } from './_lib/favorito-schemas.js'
import { RestoreBody } from './_lib/restore-schema.js'
import { extensionPreflight, withExtensionCors } from './_lib/extension-cors.js'

/**
 * Favoritos — páginas web marcadas como favoritas (URL + título + nota).
 * Entidad propia, separada de recortes: un favorito es un marcador para
 * volver, no material para curar al grafo. Soft-delete + restore. La
 * extensión postea directo desde el browser, así que responde a orígenes
 * chrome-extension:// (preflight incluido).
 */
type FavoritoRow = {
  id: string
  url: string
  title: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export default withObservability(
  'favoritos',
  async (req: Request, context: Context, { requestId }) => {
    const preflight = extensionPreflight(req)
    if (preflight) return preflight

    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id
    const cors = (res: Response) => withExtensionCors(req, res)

    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, RestoreBody, requestId)
      if (!parsed.ok) return parsed.response
      const { deletedAt } = parsed.data
      const rows = await sqlTyped<{ restored: boolean }>(sql`
        WITH restore_favorito AS (
          UPDATE favoritos SET deleted_at = NULL, updated_at = NOW()
          WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
          RETURNING 1
        )
        SELECT EXISTS (SELECT 1 FROM restore_favorito) AS restored
      `)
      if (!rows[0]?.restored) {
        return ApiErrors.notFound(requestId, 'Favorito no encontrado para restaurar')
      }
      return Response.json({ restored: true })
    }

    if (req.method === 'GET') {
      // ?url= → chequeo de existencia para la extensión (¿ya es favorita?).
      const probeUrl = new URL(req.url).searchParams.get('url')
      if (probeUrl) {
        const found = await sqlTyped<FavoritoRow>(sql`
          SELECT id, url, title, note, created_at, updated_at
          FROM favoritos
          WHERE deleted_at IS NULL AND user_id = ${userId} AND url = ${probeUrl}
          ORDER BY created_at DESC
          LIMIT 1
        `)
        return cors(Response.json({ favorito: found[0] ?? null }))
      }
      const rows = await sqlTyped<FavoritoRow>(sql`
        SELECT id, url, title, note, created_at, updated_at
        FROM favoritos
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `)
      return cors(Response.json(rows))
    }

    if (req.method === 'POST' && !id) {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, FavoritoCreateBody, requestId)
      if (!parsed.ok) return cors(parsed.response)
      const b = parsed.data
      // Idempotente por URL: si la página ya es favorita (no borrada), devuelve
      // la existente (200) en lugar de duplicarla; si no, la inserta (201).
      const rows = await sqlTyped<FavoritoRow & { inserted: boolean }>(sql`
        WITH existing AS (
          SELECT id, url, title, note, created_at, updated_at
          FROM favoritos
          WHERE user_id = ${userId} AND url = ${b.url} AND deleted_at IS NULL
          LIMIT 1
        ),
        ins AS (
          INSERT INTO favoritos (url, title, note, user_id)
          SELECT ${b.url}, ${b.title ?? null}, ${b.note ?? null}, ${userId}
          WHERE NOT EXISTS (SELECT 1 FROM existing)
          RETURNING id, url, title, note, created_at, updated_at
        )
        SELECT id, url, title, note, created_at, updated_at, true AS inserted FROM ins
        UNION ALL
        SELECT id, url, title, note, created_at, updated_at, false AS inserted FROM existing
      `)
      const row = rows[0]
      if (!row)
        return cors(ApiErrors.internal(requestId, 'No se pudo guardar el favorito'))
      const { inserted, ...favorito } = row
      return cors(Response.json(favorito, { status: inserted ? 201 : 200 }))
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, FavoritoPatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const b = parsed.data
      const rows = await sqlTyped<FavoritoRow>(sql`
        UPDATE favoritos
        SET title = CASE WHEN ${b.title !== undefined} THEN ${b.title ?? null} ELSE title END,
            note = CASE WHEN ${b.note !== undefined} THEN ${b.note ?? null} ELSE note END,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id, url, title, note, created_at, updated_at
      `)
      if (rows.length === 0)
        return ApiErrors.notFound(requestId, 'Favorito no encontrado')
      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      const rows = await sqlTyped<{ deleted_at: string }>(sql`
        UPDATE favoritos SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING deleted_at
      `)
      return Response.json({ ok: true, deletedAt: rows[0]?.deleted_at ?? null })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/favoritos', '/api/favoritos/:id', '/api/favoritos/:id/restore'],
}
