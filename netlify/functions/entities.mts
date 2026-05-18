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
      SELECT id, type, name, year, description, created_at
      FROM entities
      ORDER BY created_at DESC
    `
    return Response.json(rows)
  }

  if (req.method === 'POST') {
    const body = (await req.json()) as {
      type: string
      name: string
      year?: number | null
      description?: string | null
    }
    const rows = await sql`
      INSERT INTO entities (type, name, year, description)
      VALUES (${body.type}, ${body.name}, ${body.year ?? null}, ${body.description ?? null})
      RETURNING id, type, name, year, description, created_at
    `
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'DELETE' && id) {
    await sql`DELETE FROM entities WHERE id = ${id}`
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config: Config = {
  path: ['/api/entities', '/api/entities/:id'],
}
