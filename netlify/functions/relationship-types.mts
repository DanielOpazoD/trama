import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'

export default withObservability('relationship-types', async (req: Request, context: Context) => {
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
    const body = (await req.json()) as {
      slug: string
      label: string
      reverse_label: string
      sort_order?: number
    }
    if (!body.slug || !body.label || !body.reverse_label) {
      return new Response('slug, label y reverse_label requeridos', { status: 400 })
    }
    if (!/^[a-z0-9_]+$/.test(body.slug)) {
      return new Response('slug debe ser lowercase, números o _', { status: 400 })
    }
    const rows = await sql`
      INSERT INTO relationship_types (slug, label, reverse_label, sort_order)
      VALUES (${body.slug}, ${body.label}, ${body.reverse_label}, ${body.sort_order ?? 100})
      ON CONFLICT (slug) DO UPDATE SET
        label = EXCLUDED.label,
        reverse_label = EXCLUDED.reverse_label,
        sort_order = EXCLUDED.sort_order
      RETURNING slug, label, reverse_label, sort_order
    `
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'DELETE' && slug) {
    const usage = (await sql`
      SELECT COUNT(*) AS n FROM relationships WHERE type = ${slug} AND deleted_at IS NULL
    `) as Array<{ n: string }>
    if (Number(usage[0]?.n ?? 0) > 0) {
      return new Response(
        `Tipo en uso por ${usage[0].n} relación(es). Reasigna antes de borrar.`,
        { status: 409 },
      )
    }
    await sql`DELETE FROM relationship_types WHERE slug = ${slug}`
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
})

export const config: Config = {
  path: ['/api/relationship-types', '/api/relationship-types/:slug'],
}
