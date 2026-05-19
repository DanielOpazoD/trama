import { neon } from '@neondatabase/serverless'
import type { Config, Context } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'

type Origin = { kind: string; [key: string]: unknown }

function normalizeOrigin(value: unknown): Origin {
  if (value && typeof value === 'object' && 'kind' in (value as Record<string, unknown>)) {
    return value as Origin
  }
  if (typeof value === 'string') {
    return { kind: value === 'ai' ? 'ai' : 'manual' }
  }
  return { kind: 'manual' }
}

export default withObservability('relationships', async (req: Request, context: Context) => {
  const connectionString = Netlify.env.get('NETLIFY_DATABASE_URL')
  if (!connectionString) {
    return new Response('NETLIFY_DATABASE_URL no está configurada', { status: 500 })
  }
  const sql = neon(connectionString)
  const id = context.params.id

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, from_id, to_id, type, notes, origin, created_at, updated_at
      FROM relationships
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `
    return Response.json(rows)
  }

  if (req.method === 'POST') {
    const body = (await req.json()) as {
      from_id: string
      to_id: string
      type: string
      notes?: string | null
      origin?: unknown
    }
    const origin = JSON.stringify(normalizeOrigin(body.origin))
    const rows = await sql`
      INSERT INTO relationships (from_id, to_id, type, notes, origin)
      VALUES (
        ${body.from_id},
        ${body.to_id},
        ${body.type},
        ${body.notes ?? null},
        ${origin}::jsonb
      )
      RETURNING id, from_id, to_id, type, notes, origin, created_at, updated_at
    `
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'DELETE' && id) {
    await sql`UPDATE relationships SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
})

export const config: Config = {
  path: ['/api/relationships', '/api/relationships/:id'],
}
