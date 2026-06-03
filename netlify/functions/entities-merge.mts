import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { EntityMergeBody } from './_lib/entity-schemas.js'
import { logEvent } from './_lib/observability.js'

/**
 * POST /api/entities-merge — combina entidades duplicadas.
 *
 * Reasigna a `keepId` todo lo que apunta a los `mergeIds` (citas, relaciones,
 * momento_entities) y luego soft-deletea los duplicados. Cuida la integridad:
 *   - momento_entities tiene PK (momento_id, entity_id) → INSERT ON CONFLICT
 *     antes de soft-deletear links viejos, para no violar la PK si un
 *     momento ya tenía ambas.
 *   - relationships puede quedar con self-loops (from = to) tras reasignar →
 *     se soft-deletean.
 * No es atómico (el driver HTTP de Neon no da transacciones multi-statement
 * acá); el orden hace que re-correr el merge sea seguro (idempotente).
 *
 * Nota: no deduplica relaciones idénticas (mismo from/to/type) tras el merge —
 * quedan como están; el usuario puede limpiarlas. Self-loops sí se quitan.
 */
type EntityRow = {
  id: string
  type: string
  name: string
  year: number | null
  description: string | null
  essay: string | null
  position_x: number | null
  position_y: number | null
  origin: unknown
  spotify_url: string | null
  wikipedia_url: string | null
  created_at: string
  updated_at: string
}

export default withObservability(
  'entities-merge',
  async (req: Request, _ctx: Context, { requestId }) => {
    if (req.method !== 'POST') return ApiErrors.methodNotAllowed(requestId)
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()

    const parsed = await parseJsonBody(req, EntityMergeBody, requestId)
    if (!parsed.ok) return parsed.response
    const { keepId } = parsed.data
    const mergeIds = parsed.data.mergeIds.filter((id) => id !== keepId)
    if (mergeIds.length === 0) {
      return ApiErrors.validation(requestId, 'No hay entidades distintas para combinar')
    }
    // Todas (keep + merge) deben existir, ser del usuario y estar vivas.
    const ids = [keepId, ...mergeIds]
    const found = (await sql`
      SELECT id FROM entities
      WHERE id = ANY(${ids}::uuid[]) AND deleted_at IS NULL AND user_id = ${userId}
    `) as Array<{ id: string }>
    if (found.length !== ids.length) {
      return ApiErrors.notFound(requestId, 'Alguna entidad no existe o no es tuya')
    }

    await ensureUserRow(sql, authedUser)

    // Atomicidad real vía un único CTE (mismo patrón que momentos-merge): el
    // driver HTTP de Neon no da transacciones multi-statement, pero Postgres
    // ejecuta un CTE como una unidad atómica — todos los sub-writes commitean
    // juntos o ninguno. Antes eran 7 writes secuenciales que, si el Lambda
    // moría a mitad, dejaban el grafo a medio reasignar. Los CTE que modifican
    // datos corren siempre a término aunque el SELECT final no los referencie.
    //
    // Las CTEs corren sobre el MISMO snapshot (no se ven entre sí), así que el
    // reasignar-relaciones y el quitar-self-loops —que dependían del orden— se
    // combinan en UN solo UPDATE con CASE: cada relación se toca una vez y queda
    // como self-loop (deleted_at = NOW()) si, tras mapear ambos extremos
    // (mergeIds→keepId), el origen iguala al destino. Eso acota el borrado de
    // self-loops a las relaciones tocadas por el merge (el WHERE filtra por
    // from_id/to_id ∈ mergeIds), sin barrer self-loops preexistentes de otras
    // entidades como hacía la versión anterior.
    const rows = await sqlTyped<EntityRow>(sql`
      WITH reassign_quotes AS (
        UPDATE quotes SET entity_id = ${keepId}
        WHERE entity_id = ANY(${mergeIds}::uuid[]) AND user_id = ${userId}
        RETURNING 1
      ),
      reassign_momentos AS (
        INSERT INTO momento_entities (momento_id, entity_id, user_id)
        SELECT momento_id, ${keepId}, ${userId} FROM momento_entities
        WHERE entity_id = ANY(${mergeIds}::uuid[])
          AND user_id = ${userId}
          AND deleted_at IS NULL
        ON CONFLICT (momento_id, entity_id) DO UPDATE
        SET user_id = EXCLUDED.user_id, deleted_at = NULL
        RETURNING 1
      ),
      soft_delete_old_momentos AS (
        UPDATE momento_entities SET deleted_at = NOW()
        WHERE entity_id = ANY(${mergeIds}::uuid[])
          AND user_id = ${userId}
          AND deleted_at IS NULL
        RETURNING 1
      ),
      reassign_rels AS (
        UPDATE relationships r SET
          from_id = CASE WHEN r.from_id = ANY(${mergeIds}::uuid[]) THEN ${keepId} ELSE r.from_id END,
          to_id = CASE WHEN r.to_id = ANY(${mergeIds}::uuid[]) THEN ${keepId} ELSE r.to_id END,
          deleted_at = CASE
            WHEN (CASE WHEN r.from_id = ANY(${mergeIds}::uuid[]) THEN ${keepId} ELSE r.from_id END)
               = (CASE WHEN r.to_id = ANY(${mergeIds}::uuid[]) THEN ${keepId} ELSE r.to_id END)
            THEN NOW() ELSE r.deleted_at END
        WHERE (r.from_id = ANY(${mergeIds}::uuid[]) OR r.to_id = ANY(${mergeIds}::uuid[]))
          AND r.user_id = ${userId} AND r.deleted_at IS NULL
        RETURNING 1
      ),
      soft_delete_dupes AS (
        UPDATE entities SET deleted_at = NOW()
        WHERE id = ANY(${mergeIds}::uuid[]) AND user_id = ${userId}
        RETURNING 1
      )
      SELECT id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, created_at, updated_at
      FROM entities WHERE id = ${keepId} AND user_id = ${userId}
    `)

    logEvent({ event: 'entities_merged', keepId, merged: mergeIds.length })
    return Response.json(rows[0])
  },
)

export const config: Config = {
  path: '/api/entities-merge',
}
