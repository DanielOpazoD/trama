import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { WhatsAppLinkCreateBody } from './_lib/whatsapp-schemas.js'
import { generateLinkCode, LINK_CODE_TTL_MINUTES } from './_lib/whatsapp/link-code.js'

/**
 * Gestión de números de WhatsApp vinculados ("Conectar WhatsApp" en
 * Configuración). El usuario genera un código de un solo uso y lo canjea
 * enviando "vincular <código>" por WhatsApp — eso prueba que controla el
 * número antes de que el webhook escriba en su nombre.
 *
 * GET    → lista los números vinculados (verificados) del usuario.
 * POST   → genera un código nuevo (invalida códigos pendientes previos).
 * DELETE → desvincula un número (soft-delete).
 */
type LinkRow = {
  id: string
  phone_e164: string | null
  label: string | null
  verified_at: string | null
  last_message_at: string | null
  created_at: string
}

export default withObservability(
  'whatsapp-link',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'GET') {
      const rows = await sqlTyped<LinkRow>(sql`
        SELECT id, phone_e164, label, verified_at, last_message_at, created_at
        FROM whatsapp_links
        WHERE user_id = ${userId} AND deleted_at IS NULL AND verified_at IS NOT NULL
        ORDER BY created_at DESC
      `)
      return Response.json(rows)
    }

    if (req.method === 'POST' && !id) {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, WhatsAppLinkCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const code = generateLinkCode()
      const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000).toISOString()
      // Un solo CTE: invalidamos cualquier código pendiente previo del usuario
      // (sin número aún) y creamos el nuevo. Así no se acumulan códigos vivos.
      const rows = await sqlTyped<{ id: string; link_code: string; link_code_expires_at: string }>(sql`
        WITH expire_pending AS (
          UPDATE whatsapp_links
          SET deleted_at = NOW(), updated_at = NOW()
          WHERE user_id = ${userId} AND deleted_at IS NULL
            AND verified_at IS NULL AND phone_e164 IS NULL
          RETURNING 1
        )
        INSERT INTO whatsapp_links (user_id, label, link_code, link_code_expires_at)
        VALUES (
          ${userId},
          ${parsed.data.label ?? null},
          ${code},
          ${expiresAt}::timestamptz
        )
        RETURNING id, link_code, link_code_expires_at
      `)
      return Response.json(
        {
          id: rows[0]!.id,
          code: rows[0]!.link_code,
          expiresAt: rows[0]!.link_code_expires_at,
          ttlMinutes: LINK_CODE_TTL_MINUTES,
        },
        { status: 201 },
      )
    }

    if (req.method === 'DELETE' && id) {
      const rows = await sqlTyped<{ id: string }>(sql`
        UPDATE whatsapp_links
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Vínculo no encontrado')
      return Response.json({ ok: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/whatsapp-link', '/api/whatsapp-link/:id'],
}
