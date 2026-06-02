import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { SecretCreateBody, SecretPatchBody } from './_lib/secret-schemas.js'

type SecretRow = {
  id: string
  label: string
  kind: string
  service: string | null
  username: string | null
  notes: string | null
  favorite: boolean
  critical: boolean
  expires_at: string | null
  last_rotated_at: string | null
  copied_at: string | null
  created_at: string
  updated_at: string
}

export default withObservability(
  'secrets',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id
    const pathname = new URL(req.url).pathname

    if (req.method === 'GET' && id && pathname.endsWith('/reveal')) {
      const rows = await sqlTyped<{ secret_value: string }>(sql`
        SELECT secret_value
        FROM secrets
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Clave no encontrada')
      return Response.json({ secret: rows[0]!.secret_value })
    }

    if (req.method === 'POST' && id && pathname.endsWith('/copied')) {
      const rows = await sqlTyped<{ id: string }>(sql`
        UPDATE secrets
        SET copied_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Clave no encontrada')
      return Response.json({ ok: true })
    }

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const q = url.searchParams.get('q')?.trim()
      const kind = url.searchParams.get('kind')?.trim()
      if (q) {
        const rows = await sqlTyped<SecretRow>(sql`
          SELECT id, label, kind, service, username, notes, favorite, critical,
                 to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
                 to_char(last_rotated_at, 'YYYY-MM-DD') AS last_rotated_at,
                 copied_at, created_at, updated_at
          FROM secrets
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND (label ILIKE ${'%' + q + '%'} OR service ILIKE ${'%' + q + '%'} OR username ILIKE ${'%' + q + '%'} OR notes ILIKE ${'%' + q + '%'})
          ORDER BY favorite DESC, critical DESC, updated_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      if (kind) {
        const rows = await sqlTyped<SecretRow>(sql`
          SELECT id, label, kind, service, username, notes, favorite, critical,
                 to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
                 to_char(last_rotated_at, 'YYYY-MM-DD') AS last_rotated_at,
                 copied_at, created_at, updated_at
          FROM secrets
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND kind = ${kind}
          ORDER BY favorite DESC, critical DESC, updated_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      const rows = await sqlTyped<SecretRow>(sql`
        SELECT id, label, kind, service, username, notes, favorite, critical,
               to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
               to_char(last_rotated_at, 'YYYY-MM-DD') AS last_rotated_at,
               copied_at, created_at, updated_at
        FROM secrets
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY favorite DESC, critical DESC, updated_at DESC, id DESC
      `)
      return Response.json(rows)
    }

    if (req.method === 'POST') {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, SecretCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data
      const rows = await sqlTyped<SecretRow>(sql`
        INSERT INTO secrets (
          label, secret_value, kind, service, username, notes, favorite, critical,
          expires_at, last_rotated_at, user_id
        )
        VALUES (
          ${body.label}, ${body.secret}, ${body.kind}, ${body.service ?? null},
          ${body.username ?? null}, ${body.notes ?? null}, ${body.favorite ?? false},
          ${body.critical ?? false}, ${body.expiresAt ?? null}, ${body.lastRotatedAt ?? null},
          ${userId}
        )
        RETURNING id, label, kind, service, username, notes, favorite, critical,
                  to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
                  to_char(last_rotated_at, 'YYYY-MM-DD') AS last_rotated_at,
                  copied_at, created_at, updated_at
      `)
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, SecretPatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data
      const rows = await sqlTyped<SecretRow>(sql`
        UPDATE secrets
        SET label = COALESCE(${body.label ?? null}, label),
            secret_value = COALESCE(${body.secret ?? null}, secret_value),
            kind = COALESCE(${body.kind ?? null}, kind),
            service = CASE WHEN ${body.service !== undefined} THEN ${body.service ?? null} ELSE service END,
            username = CASE WHEN ${body.username !== undefined} THEN ${body.username ?? null} ELSE username END,
            notes = CASE WHEN ${body.notes !== undefined} THEN ${body.notes ?? null} ELSE notes END,
            favorite = CASE
                         WHEN ${body.favorite === true} THEN true
                         WHEN ${body.favorite === false} THEN false
                         ELSE favorite
                       END,
            critical = CASE
                         WHEN ${body.critical === true} THEN true
                         WHEN ${body.critical === false} THEN false
                         ELSE critical
                       END,
            expires_at = CASE WHEN ${body.expiresAt !== undefined} THEN ${body.expiresAt ?? null} ELSE expires_at END,
            last_rotated_at = CASE WHEN ${body.lastRotatedAt !== undefined} THEN ${body.lastRotatedAt ?? null} ELSE last_rotated_at END,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id, label, kind, service, username, notes, favorite, critical,
                  to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
                  to_char(last_rotated_at, 'YYYY-MM-DD') AS last_rotated_at,
                  copied_at, created_at, updated_at
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Clave no encontrada')
      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      await sql`
        UPDATE secrets SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `
      return Response.json({ ok: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: [
    '/api/secrets',
    '/api/secrets/:id',
    '/api/secrets/:id/reveal',
    '/api/secrets/:id/copied',
  ],
}
