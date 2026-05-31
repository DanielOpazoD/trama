/**
 * U-2: Eco — al pedir los ecos de una cita, devolvemos las top-3 citas
 * más similares en la trama del usuario (por embedding), excluyendo la
 * cita base.
 *
 * Es **marginalia**, no recomendación: el cliente lo muestra como una
 * sugerencia editorial efímera ("esto te recordó a…") tras crear o
 * abrir una cita. La idea es ofrecer conexiones que el usuario quizá no
 * pensó, sin imponerlas.
 *
 * Side-effect-free: solo lectura.
 *
 * Endpoint: GET /api/quotes/:id/echoes
 * Response: Array<{ id, entityName, text, source }>
 */

import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

type EchoRow = {
  id: string
  entity_name: string
  text: string
  source: string | null
}

const ECHOES_LIMIT = 3

export default withObservability(
  'quote-echoes',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method !== 'GET') {
      return ApiErrors.methodNotAllowed(requestId)
    }

    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()
    const id = context.params.id
    if (!id) {
      return ApiErrors.validation(requestId, 'Falta el id de la cita')
    }

    // Buscar las top-3 citas más similares por embedding, excluyendo la
    // cita base y citas borradas. Si la cita base no tiene embedding
    // (ej. embedding falló al crearla), devolvemos array vacío — no es
    // un error visible, simplemente no hay ecos sobre los que basarnos.
    //
    // Patrón pgvector: ORDER BY embedding <=> base_embedding limita a
    // similarity coseno. Usamos un subquery para extraer el embedding
    // de la cita base en la misma round-trip.
    const rows = await sqlTyped<EchoRow>(sql`
      SELECT q.id, e.name AS entity_name, q.text, q.source
      FROM quotes q
      JOIN entities e ON e.id = q.entity_id
        AND e.deleted_at IS NULL
        AND e.user_id = ${userId}
      WHERE q.id != ${id}
        AND q.user_id = ${userId}
        AND q.deleted_at IS NULL
        AND q.embedding IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM quotes base
          WHERE base.id = ${id}
            AND base.user_id = ${userId}
            AND base.embedding IS NOT NULL
        )
      ORDER BY q.embedding <=> (
        SELECT embedding FROM quotes WHERE id = ${id} AND user_id = ${userId}
      )
      LIMIT ${ECHOES_LIMIT}
    `)

    return Response.json(
      rows.map((r) => ({
        id: r.id,
        entityName: r.entity_name,
        text: r.text,
        source: r.source,
      })),
    )
  },
)

export const config: Config = {
  path: '/api/quotes/:id/echoes',
}
