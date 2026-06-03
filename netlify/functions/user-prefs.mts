import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'

/**
 * Preferencias de UI por usuario (sincronizadas entre dispositivos): un JSONB
 * por usuario en `user_prefs.prefs`. Hoy: qué subsecciones del mundo Notas se
 * ven (`visibleModules`) y el mundo default (`defaultWorld`).
 *
 * GET → devuelve el objeto de prefs (o `{}`).
 * PUT → MERGE SUPERFICIAL (`jsonb ||`) de las claves enviadas, así actualizar
 *       una pref no pisa las otras. El cliente manda el sub-objeto COMPLETO de
 *       la clave que cambia (p. ej. todo `visibleModules`).
 */
const UserPrefsBody = z
  .object({
    visibleModules: z.record(z.string(), z.boolean()).optional(),
    defaultWorld: z.enum(['trama', 'notas']).optional(),
  })
  .strict()

type PrefsRow = { prefs: Record<string, unknown> }

export default withObservability('user-prefs', async (req, _ctx, { requestId }) => {
  const authedUser = await getAuthedUser(req)
  const userId = authedUser.id
  const sql = getSql()

  if (req.method === 'GET') {
    const rows = await sqlTyped<PrefsRow>(sql`
      SELECT prefs FROM user_prefs WHERE user_id = ${userId}
    `)
    return Response.json(rows[0]?.prefs ?? {})
  }

  if (req.method === 'PUT') {
    const parsed = await parseJsonBody(req, UserPrefsBody, requestId)
    if (!parsed.ok) return parsed.response
    await ensureUserRow(sql, authedUser)
    const patch = JSON.stringify(parsed.data)
    const rows = await sqlTyped<PrefsRow>(sql`
      INSERT INTO user_prefs (user_id, prefs)
      VALUES (${userId}, ${patch}::jsonb)
      ON CONFLICT (user_id) DO UPDATE
        SET prefs = COALESCE(user_prefs.prefs, '{}'::jsonb) || EXCLUDED.prefs,
            updated_at = NOW()
      RETURNING prefs
    `)
    return Response.json(rows[0]?.prefs ?? parsed.data)
  }

  return ApiErrors.methodNotAllowed(requestId)
})

export const config: Config = {
  path: '/api/user-prefs',
}
