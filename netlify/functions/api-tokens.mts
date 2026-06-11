import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { ApiTokenCreateBody } from './_lib/recorte-schemas.js'
import { generateToken, isPersonalToken } from './_lib/personal-tokens.js'

/**
 * Tokens personales para la extensión de Chrome ("Conectar extensión" en
 * Configuración). El token en claro se devuelve UNA sola vez al crearlo;
 * después solo existe su hash. Revocar es soft (revoked_at) — el listado
 * muestra label, creación y último uso para que el usuario reconozca y
 * corte un token filtrado.
 *
 * Guard: un PAT no puede gestionar PATs (solo una sesión real de la app)
 * — si se filtra el token de la extensión, no sirve para fabricar otros.
 */
type TokenRow = {
  id: string
  label: string
  created_at: string
  last_used_at: string | null
}

function isPatRequest(req: Request): boolean {
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  return Boolean(bearer && isPersonalToken(bearer))
}

export default withObservability(
  'api-tokens',
  async (req: Request, context: Context, { requestId }) => {
    if (isPatRequest(req)) {
      return ApiErrors.unauthenticated(
        requestId,
        'Los tokens de extensión no pueden gestionar tokens',
      )
    }
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'GET') {
      const rows = await sqlTyped<TokenRow>(sql`
        SELECT id, label, created_at, last_used_at
        FROM api_tokens
        WHERE user_id = ${userId} AND revoked_at IS NULL
        ORDER BY created_at DESC
      `)
      return Response.json(rows)
    }

    if (req.method === 'POST' && !id) {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, ApiTokenCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const { token, hash } = generateToken()
      const rows = await sqlTyped<TokenRow>(sql`
        INSERT INTO api_tokens (user_id, token_hash, label)
        VALUES (${userId}, ${hash}, ${parsed.data.label})
        RETURNING id, label, created_at, last_used_at
      `)
      // El claro viaja SOLO en esta respuesta.
      return Response.json({ ...rows[0], token }, { status: 201 })
    }

    if (req.method === 'DELETE' && id) {
      const rows = await sqlTyped<{ id: string }>(sql`
        UPDATE api_tokens SET revoked_at = NOW()
        WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL
        RETURNING id
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Token no encontrado')
      return Response.json({ ok: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/api-tokens', '/api/api-tokens/:id'],
}
