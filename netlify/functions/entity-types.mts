import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors, ApiSuccess } from './_lib/api-error.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { EntityTypeUpsertBody } from './_lib/admin-schemas.js'
import { getAuthedUser } from './_lib/auth.js'

type UsageRow = { n: string }

/**
 * Catálogo global de tipos de entidad. GET es público (la lista de slugs
 * no es información sensible — la usa cualquier select del frontend).
 * POST y DELETE requieren auth: cualquier usuario autenticado puede
 * mantener el catálogo, pero un request anónimo no debe poder editarlo.
 *
 * Multi-user nota: hoy el catálogo es global compartido — un user no
 * "tiene su catálogo". Si en el futuro se quiere per-user, hay que
 * migrar a (user_id, slug) y filtrar por user_id en el check de uso.
 */
export default withObservability(
  'entity-types',
  async (req: Request, context: Context, { requestId }) => {
    const sql = getSql()
    const slug = context.params.slug

    if (req.method === 'GET') {
      const rows = await sql`
      SELECT slug, label, sort_order FROM entity_types
      ORDER BY sort_order, slug
    `
      return Response.json(rows)
    }

    if (req.method === 'POST') {
      await getAuthedUser(req)
      const parsed = await parseJsonBody(req, EntityTypeUpsertBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data
      const rows = await sqlTyped<{
        slug: string
        label: string
        sort_order: number
      }>(sql`
      INSERT INTO entity_types (slug, label, sort_order)
      VALUES (${body.slug}, ${body.label}, ${body.sort_order ?? 100})
      ON CONFLICT (slug) DO UPDATE SET
        label = EXCLUDED.label,
        sort_order = EXCLUDED.sort_order
      RETURNING slug, label, sort_order
    `)
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'DELETE' && slug) {
      await getAuthedUser(req)
      // Check if any entity uses this type before allowing delete.
      const usage = await sqlTyped<UsageRow>(sql`
      SELECT COUNT(*) AS n FROM entities WHERE type = ${slug} AND deleted_at IS NULL
    `)
      if (Number(usage[0]?.n ?? 0) > 0) {
        return ApiErrors.conflict(
          requestId,
          `Tipo en uso por ${usage[0]?.n ?? 0} entidad(es). Reasigna antes de borrar.`,
        )
      }
      await sql`DELETE FROM entity_types WHERE slug = ${slug}`
      return ApiSuccess.noContent()
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/entity-types', '/api/entity-types/:slug'],
}
