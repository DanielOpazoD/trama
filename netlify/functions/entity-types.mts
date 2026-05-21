import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'

export default async (req: Request, context: Context) => {
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
    const body = (await req.json()) as {
      slug: string
      label: string
      sort_order?: number
    }
    if (!body.slug || !body.label) {
      return new Response('slug y label requeridos', { status: 400 })
    }
    if (!/^[a-z0-9_]+$/.test(body.slug)) {
      return new Response('slug debe ser lowercase, números o _', { status: 400 })
    }
    const rows = await sql`
      INSERT INTO entity_types (slug, label, sort_order)
      VALUES (${body.slug}, ${body.label}, ${body.sort_order ?? 100})
      ON CONFLICT (slug) DO UPDATE SET
        label = EXCLUDED.label,
        sort_order = EXCLUDED.sort_order
      RETURNING slug, label, sort_order
    `
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'DELETE' && slug) {
    // Check if any entity uses this type before allowing delete.
    const usage = (await sql`
      SELECT COUNT(*) AS n FROM entities WHERE type = ${slug} AND deleted_at IS NULL
    `) as Array<{ n: string }>
    if (Number(usage[0]?.n ?? 0) > 0) {
      return new Response(
        `Tipo en uso por ${usage[0].n} entidad(es). Reasigna antes de borrar.`,
        { status: 409 },
      )
    }
    await sql`DELETE FROM entity_types WHERE slug = ${slug}`
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config: Config = {
  path: ['/api/entity-types', '/api/entity-types/:slug'],
}
