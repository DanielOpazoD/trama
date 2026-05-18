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
      SELECT id, entity_id, text, source, context, origin, created_at
      FROM quotes
      ORDER BY created_at DESC
    `
    return Response.json(rows)
  }

  if (req.method === 'POST') {
    const body = (await req.json()) as {
      entity_id: string
      text: string
      source?: string | null
      context?: string | null
      origin?: string | null
    }
    const origin = body.origin === 'ai' ? 'ai' : 'manual'
    const rows = await sql`
      INSERT INTO quotes (entity_id, text, source, context, origin)
      VALUES (${body.entity_id}, ${body.text}, ${body.source ?? null}, ${body.context ?? null}, ${origin})
      RETURNING id, entity_id, text, source, context, origin, created_at
    `
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'DELETE' && id) {
    await sql`DELETE FROM quotes WHERE id = ${id}`
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config: Config = {
  path: ['/api/quotes', '/api/quotes/:id'],
}
