import type { Context } from '@netlify/functions'
import { getSql } from './db.js'
import { withObservability } from './handler-wrap.js'
import { ApiErrors } from './api-error.js'
import { getAuthedUser } from './auth.js'
import {
  handleCreateMomento,
  handleDeleteMomento,
  handleGetMomento,
  handleListMomentos,
  handleUpdateMomento,
} from './momentos/handlers.js'

/**
 * /api/momentos — la dimensión temporal de la trama.
 *
 *   GET    /api/momentos?cursor=&limit=&kind=        → lista paginada
 *   GET    /api/momentos/:id                         → uno solo
 *   POST   /api/momentos                             → crear
 *   PATCH  /api/momentos/:id                         → editar
 *   DELETE /api/momentos/:id                         → soft-delete
 *
 * Arquitectura del módulo `momentos/`:
 *   - data.ts      → acceso a datos (un template SQL por interacción).
 *   - handlers.ts  → un handler por operación (validación, errores, respuesta).
 *   - este archivo → router: resuelve auth una vez y despacha por método + id.
 *
 * Las entradas tienen tres kinds (nota / recorte / foto); el payload jsonb
 * varía según kind y se valida en código (no en SQL) para agregar kinds sin
 * migración. Linking N:M con entidades vía momento_entities. El embedding del
 * texto agregado es best-effort (ver handlers).
 */

export default withObservability(
  'momentos',
  async (req: Request, context: Context, { requestId }) => {
    const sql = getSql()
    const authedUser = await getAuthedUser(req, {
      requestId,
      operation: `momentos.${req.method.toLowerCase()}`,
    })
    const userId = authedUser.id
    const id = context.params.id

    if (req.method === 'GET' && id) {
      return handleGetMomento(sql, id, userId, requestId)
    }
    if (req.method === 'GET') {
      return handleListMomentos(req, sql, userId, requestId)
    }
    if (req.method === 'POST' && !id) {
      return handleCreateMomento(req, sql, authedUser, userId, requestId)
    }
    if (req.method === 'PATCH' && id) {
      return handleUpdateMomento(req, sql, id, authedUser, userId, requestId)
    }
    if (req.method === 'DELETE' && id) {
      return handleDeleteMomento(req, sql, id, authedUser, userId, requestId)
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)
