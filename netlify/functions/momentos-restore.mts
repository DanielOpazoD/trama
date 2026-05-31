import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { MomentoRestoreBody } from './_lib/momento-extra-schemas.js'
import { ensureUserRow } from './_lib/user-provisioning.js'

/**
 * EE-followup: restaurar un momento soft-deleted.
 *
 * POST /api/momentos-restore
 * body: { id: string, deletedAt: string }
 *
 * El `deletedAt` actúa como CSRF-light: el cliente debió haber recibido
 * ese timestamp en el response del soft-delete (o del merge). Si no
 * matchea (porque el row fue restaurado, re-borrado, o el cliente está
 * usando un payload viejo), respondemos 409.
 *
 * Caso de uso primario: toast "deshacer" de la barra de fusión (EE).
 * Cuando el usuario fusiona N momentos, los other-N quedan soft-deleted;
 * este endpoint los devuelve a la vida. Análogo a /api/quotes/:id/restore
 * que ya existe para citas (V1).
 */
export default withObservability('momentos-restore', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  const sql = getSql()
  const authedUser = await getAuthedUser(req)
  const { id: userId } = authedUser

  const parsed = await parseJsonBody(req, MomentoRestoreBody, requestId)
  if (!parsed.ok) return parsed.response
  const { id, deletedAt } = parsed.data
  await ensureUserRow(sql, authedUser)

  // UPDATE atómico — solo si deleted_at matchea exactamente. Si no
  // matchea (alguien lo restauró o re-borró), 0 rows afectadas → 409.
  const result = (await sql`
    UPDATE momentos
    SET deleted_at = NULL, updated_at = NOW()
    WHERE id = ${id} AND deleted_at = ${deletedAt}::timestamptz AND user_id = ${userId}
    RETURNING id, kind, captured_at, payload, note, origin,
              created_at, updated_at
  `) as Array<Record<string, unknown>>

  if (result.length === 0) {
    return ApiErrors.conflict(
      requestId,
      'No se pudo restaurar: el momento ya fue restaurado o no existe con ese deletedAt',
    )
  }

  // Devolvemos también los entity_ids actuales (los links no se borraron
  // en el soft-delete original, así que siguen ahí).
  const links = (await sql`
    SELECT entity_id
    FROM momento_entities
    WHERE momento_id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
  `) as Array<{ entity_id: string }>

  return Response.json({
    ...result[0],
    entity_ids: links.map((l) => l.entity_id),
  })
})

export const config: Config = {
  path: '/api/momentos-restore',
}
