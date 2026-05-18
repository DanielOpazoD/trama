import { neon } from '@neondatabase/serverless'
import type { Config, Context } from '@netlify/functions'

export default async (req: Request, context: Context) => {
  const connectionString = Netlify.env.get('NETLIFY_DATABASE_URL')
  if (!connectionString) {
    return new Response('NETLIFY_DATABASE_URL no está configurada', { status: 500 })
  }
  const sql = neon(connectionString)
  const id = context.params.id

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, from_id, to_id, type, notes, created_at
      FROM relationships
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
    }
    const rows = await sql`
      INSERT INTO relationships (from_id, to_id, type, notes)
      VALUES (${body.from_id}, ${body.to_id}, ${body.type}, ${body.notes ?? null})
      RETURNING id, from_id, to_id, type, notes, created_at
    `
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'DELETE' && id) {
    await sql`DELETE FROM relationships WHERE id = ${id}`
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config: Config = {
  path: ['/api/relationships', '/api/relationships/:id'],
}
