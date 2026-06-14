import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logEvent } from './_lib/observability.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { ObjectPropertiesBody, applyObjectProperties } from './_lib/object-properties.js'

/**
 * Escritura de propiedades de usuario + tags sobre un objeto (Fase 2 del motor
 * de queries). `PATCH /api/object-properties` con `{ kind, id, setProps?,
 * unsetProps?, setTags? }`. Bajo RLS: sólo afecta filas del propio usuario.
 */
export default withObservability(
  'object-properties',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'PATCH' && req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }
    await getAuthedUser(req)
    const sql = getSql()

    const parsed = await parseJsonBody(req, ObjectPropertiesBody, requestId)
    if (!parsed.ok) return parsed.response

    const updated = await applyObjectProperties(sql, parsed.data)
    if (!updated) {
      return ApiErrors.notFound(requestId, 'Objeto no encontrado')
    }
    logEvent({ event: 'object_properties_updated', kind: parsed.data.kind })
    return Response.json({ id: updated.id })
  },
)

export const config: Config = {
  path: '/api/object-properties',
}
