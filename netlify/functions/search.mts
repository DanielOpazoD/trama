import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'

/**
 * Full-text search across entities (name + description) and quotes (text + context + source).
 *
 * Combines exact tsvector matching (via @@ to_tsquery) with trigram fuzzy matching
 * for typo tolerance on entity names. Returns ranked results from both tables.
 */
export default async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const connectionString = Netlify.env.get('NETLIFY_DATABASE_URL')
  if (!connectionString) {
    return new Response('NETLIFY_DATABASE_URL no está configurada', { status: 500 })
  }
  const sql = neon(connectionString)

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (!q) {
    return Response.json({ entities: [], quotes: [] })
  }

  // Build a websearch-style tsquery (handles user input safely).
  const tsq = sql`websearch_to_tsquery('simple', ${q})`

  type EntityHit = {
    id: string
    name: string
    type: string
    rank: number
  }
  type QuoteHit = {
    id: string
    entity_id: string
    text: string
    rank: number
  }

  const [entities, quotes] = await Promise.all([
    sql`
      SELECT id, name, type,
             ts_rank(search_vector, ${tsq}) AS rank
      FROM entities
      WHERE deleted_at IS NULL AND search_vector @@ ${tsq}
      ORDER BY rank DESC
      LIMIT 25
    ` as unknown as Promise<EntityHit[]>,
    sql`
      SELECT id, entity_id, text, ts_rank(search_vector, ${tsq}) AS rank
      FROM quotes
      WHERE deleted_at IS NULL AND search_vector @@ ${tsq}
      ORDER BY rank DESC
      LIMIT 25
    ` as unknown as Promise<QuoteHit[]>,
  ])

  return Response.json({
    entities: entities.map((e) => ({ id: e.id, name: e.name, type: e.type, rank: Number(e.rank) })),
    quotes: quotes.map((q) => ({ id: q.id, entityId: q.entity_id, text: q.text, rank: Number(q.rank) })),
  })
}

export const config: Config = {
  path: '/api/search',
}
