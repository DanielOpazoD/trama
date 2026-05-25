import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'

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
export default withObservability('momentos-restore', async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const sql = getSql()

  let body: { id?: unknown; deletedAt?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }
  const id = typeof body.id === 'string' && body.id ? body.id : null
  const deletedAt =
    typeof body.deletedAt === 'string' && body.deletedAt ? body.deletedAt : null
  if (!id) return new Response('id requerido', { status: 400 })
  if (!deletedAt) return new Response('deletedAt requerido', { status: 400 })

  // UPDATE atómico — solo si deleted_at matchea exactamente. Si no
  // matchea (alguien lo restauró o re-borró), 0 rows afectadas → 409.
  const result = (await sql`
    UPDATE momentos
    SET deleted_at = NULL, updated_at = NOW()
    WHERE id = ${id} AND deleted_at = ${deletedAt}::timestamptz
    RETURNING id, kind, captured_at, payload, note, origin,
              created_at, updated_at
  `) as Array<Record<string, unknown>>

  if (result.length === 0) {
    return new Response(
      'No se pudo restaurar: el momento ya fue restaurado o no existe con ese deletedAt',
      { status: 409 },
    )
  }

  // Devolvemos también los entity_ids actuales (los links no se borraron
  // en el soft-delete original, así que siguen ahí).
  const links = (await sql`
    SELECT entity_id FROM momento_entities WHERE momento_id = ${id}
  `) as Array<{ entity_id: string }>

  return Response.json({
    ...result[0],
    entity_ids: links.map((l) => l.entity_id),
  })
})

export const config: Config = {
  path: '/api/momentos-restore',
}
