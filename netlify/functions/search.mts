import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { embedSafe, toPgVector } from './_lib/embeddings.js'
import { fuseRanked, type Ranked } from './_lib/rrf.js'

/**
 * Hybrid search across entities (name + description) and quotes (text +
 * context + source).
 *
 * Two signals merged:
 *   - Lexical: tsvector + trigram on names. Fast, exact, no IA cost.
 *   - Semantic: cosine distance over pgvector embeddings. Catches meaning,
 *     synonyms, paraphrasing. Costs one embedding call per query (~0.0001¢).
 *
 * Results are merged and re-ranked by a combined score. If the embeddings
 * call fails (no key, transient error) we fall back to lexical-only so the
 * UI never breaks.
 *
 * Query params:
 *   q       — required, the search string
 *   limit   — optional, default 15, max 50
 *   mode    — 'hybrid' (default) | 'lexical' | 'semantic'
 */
export default async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const sql = getSql()

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const limitParam = url.searchParams.get('limit')
  const limit = Math.min(Math.max(Number.parseInt(limitParam ?? '15', 10) || 15, 1), 50)
  const mode = (url.searchParams.get('mode') ?? 'hybrid').toLowerCase()

  if (!q) {
    return Response.json({ entities: [], quotes: [] })
  }

  const wantsLexical = mode !== 'semantic'
  const wantsSemantic = mode !== 'lexical'

  // Lexical: tsvector match + trigram-similarity boost on name.
  type EntityLex = {
    id: string
    name: string
    type: string
    description: string | null
    year: number | null
    rank: number
  }
  type QuoteLex = {
    id: string
    entity_id: string
    entity_name: string
    text: string
    source: string | null
    rank: number
  }

  const lexicalEntities = wantsLexical
    ? (await sql`
        SELECT e.id, e.name, e.type, e.description, e.year,
               ts_rank(e.search_vector, websearch_to_tsquery('simple', ${q}))
                 + similarity(e.name, ${q}) * 0.5 AS rank
        FROM entities e
        WHERE e.deleted_at IS NULL
          AND (e.search_vector @@ websearch_to_tsquery('simple', ${q})
               OR e.name % ${q})
        ORDER BY rank DESC
        LIMIT ${limit * 2}
      ` as unknown as Promise<EntityLex[]>)
    : Promise.resolve([] as EntityLex[])

  const lexicalQuotes = wantsLexical
    ? (await sql`
        SELECT q.id, q.entity_id, e.name AS entity_name, q.text, q.source,
               ts_rank(q.search_vector, websearch_to_tsquery('simple', ${q})) AS rank
        FROM quotes q
        JOIN entities e ON e.id = q.entity_id
        WHERE q.deleted_at IS NULL
          AND q.search_vector @@ websearch_to_tsquery('simple', ${q})
        ORDER BY rank DESC
        LIMIT ${limit * 2}
      ` as unknown as Promise<QuoteLex[]>)
    : Promise.resolve([] as QuoteLex[])

  // Semantic: embed the query, rank by cosine distance. embedSafe returns
  // null on any failure so we degrade to lexical instead of erroring.
  type SemanticEntity = EntityLex & { distance: number }
  type SemanticQuote = QuoteLex & { distance: number }

  let semanticEntities: SemanticEntity[] = []
  let semanticQuotes: SemanticQuote[] = []
  if (wantsSemantic) {
    const emb = await embedSafe(q)
    if (emb) {
      const pgVec = toPgVector(emb.vector)
      const [er, qr] = await Promise.all([
        sql`
          SELECT id, name, type, description, year,
                 0 AS rank,
                 (embedding <=> ${pgVec}::vector) AS distance
          FROM entities
          WHERE deleted_at IS NULL AND embedding IS NOT NULL
          ORDER BY embedding <=> ${pgVec}::vector
          LIMIT ${limit * 2}
        ` as unknown as Promise<SemanticEntity[]>,
        sql`
          SELECT q.id, q.entity_id, e.name AS entity_name,
                 q.text, q.source,
                 0 AS rank,
                 (q.embedding <=> ${pgVec}::vector) AS distance
          FROM quotes q
          JOIN entities e ON e.id = q.entity_id
          WHERE q.deleted_at IS NULL AND q.embedding IS NOT NULL
          ORDER BY q.embedding <=> ${pgVec}::vector
          LIMIT ${limit * 2}
        ` as unknown as Promise<SemanticQuote[]>,
      ])
      semanticEntities = er
      semanticQuotes = qr
    }
  }

  const lex = await lexicalEntities
  const lexQ = await lexicalQuotes

  // ---------- Merge via Reciprocal Rank Fusion ----------
  // Antes sumábamos scores de escalas distintas (ts_rank vs cosine sim).
  // RRF descarta los scores y se queda con los RANKINGS. Mejor stability
  // cuando una rama trae noise, mejor combinación cuando ambas tienen señal.
  // Ver _lib/rrf.ts para el detalle.

  function toRanked<T extends { id: string }>(list: T[]): Ranked<T>[] {
    return list.map((item) => ({ id: item.id, item }))
  }

  const entitiesFused = fuseRanked([toRanked(lex), toRanked(semanticEntities)])
    .slice(0, limit)
    .map((entry) => ({
      id: entry.item.id,
      name: entry.item.name,
      type: entry.item.type,
      description: entry.item.description,
      year: entry.item.year,
      score: entry.score,
      lexicalRank: entry.ranks[0],
      semanticRank: entry.ranks[1],
      // Compat con clientes que esperaban estos campos crudos. En RRF lo
      // significativo es el rank, no el score absoluto.
      lexical: 0,
      semantic: 0,
    }))

  const quotesFused = fuseRanked([toRanked(lexQ), toRanked(semanticQuotes)])
    .slice(0, limit)
    .map((entry) => ({
      id: entry.item.id,
      entityId: entry.item.entity_id,
      entityName: entry.item.entity_name,
      text: entry.item.text,
      source: entry.item.source,
      score: entry.score,
      lexicalRank: entry.ranks[0],
      semanticRank: entry.ranks[1],
      lexical: 0,
      semantic: 0,
    }))

  return Response.json({
    entities: entitiesFused,
    quotes: quotesFused,
    mode,
  })
}

export const config: Config = {
  path: '/api/search',
}
