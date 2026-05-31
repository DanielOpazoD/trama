import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors, ApiSuccess } from './_lib/api-error.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { RelationshipTypeUpsertBody } from './_lib/admin-schemas.js'
import { getAuthedUser } from './_lib/auth.js'

type UsageRow = { n: string }

/**
 * Catálogo global de tipos de relación. Mismo patrón que entity-types:
 * GET público, POST/DELETE con auth. Ver entity-types.mts para la
 * justificación del modelo global.
 */
export default withObservability('relationship-types', async (req: Request, context: Context, { requestId }) => {
  const sql = getSql()
  const slug = context.params.slug

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT slug, label, reverse_label, sort_order FROM relationship_types
      ORDER BY sort_order, slug
    `
    return Response.json(rows)
  }

  if (req.method === 'POST') {
    await getAuthedUser(req)
    const parsed = await parseJsonBody(req, RelationshipTypeUpsertBody, requestId)
    if (!parsed.ok) return parsed.response
    const body = parsed.data
    const rows = await sqlTyped<{
      slug: string
      label: string
      reverse_label: string | null
      sort_order: number
    }>(sql`
      INSERT INTO relationship_types (slug, label, reverse_label, sort_order)
      VALUES (${body.slug}, ${body.label}, ${body.reverse_label}, ${body.sort_order ?? 100})
      ON CONFLICT (slug) DO UPDATE SET
        label = EXCLUDED.label,
        reverse_label = EXCLUDED.reverse_label,
        sort_order = EXCLUDED.sort_order
      RETURNING slug, label, reverse_label, sort_order
    `)
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'DELETE' && slug) {
    await getAuthedUser(req)
    const usage = await sqlTyped<UsageRow>(sql`
      SELECT COUNT(*) AS n FROM relationships WHERE type = ${slug} AND deleted_at IS NULL
    `)
    if (Number(usage[0]?.n ?? 0) > 0) {
      return ApiErrors.conflict(
        requestId,
        `Tipo en uso por ${usage[0]?.n ?? 0} relación(es). Reasigna antes de borrar.`,
      )
    }
    await sql`DELETE FROM relationship_types WHERE slug = ${slug}`
    return ApiSuccess.noContent()
  }

  return ApiErrors.methodNotAllowed(requestId)
})

export const config: Config = {
  path: ['/api/relationship-types', '/api/relationship-types/:slug'],
}
