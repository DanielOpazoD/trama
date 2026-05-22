import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { embedSafe, toPgVector } from './_lib/embeddings.js'

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

  // Convert cosine distance ∈ [0,2] into similarity ∈ [0,1].
  const cosineScore = (d: number) => Math.max(0, Math.min(1, 1 - Number(d) / 2))

  // Merge results: collect by id, sum scores. Lexical rank is roughly ∈ [0,1]
  // for ts_rank in our usage; semantic similarity is in [0,1]. Equal weight
  // for hybrid; we don't overthink this — the user just wants reasonable
  // results, and small score nudges either way are fine.
  type Merged = {
    score: number
    lexical: number
    semantic: number
    payload: Record<string, unknown>
  }

  function mergeEntities(): Array<Record<string, unknown>> {
    const map = new Map<string, Merged>()
    for (const e of lex) {
      map.set(e.id, {
        score: Number(e.rank),
        lexical: Number(e.rank),
        semantic: 0,
        payload: {
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
          year: e.year,
        },
      })
    }
    for (const e of semanticEntities) {
      const sim = cosineScore(e.distance)
      const existing = map.get(e.id)
      if (existing) {
        existing.semantic = sim
        existing.score = existing.lexical + sim
      } else {
        map.set(e.id, {
          score: sim,
          lexical: 0,
          semantic: sim,
          payload: {
            id: e.id,
            name: e.name,
            type: e.type,
            description: e.description,
            year: e.year,
          },
        })
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((m) => ({ ...m.payload, score: m.score, lexical: m.lexical, semantic: m.semantic }))
  }

  function mergeQuotes(): Array<Record<string, unknown>> {
    const map = new Map<string, Merged>()
    for (const q of lexQ) {
      map.set(q.id, {
        score: Number(q.rank),
        lexical: Number(q.rank),
        semantic: 0,
        payload: {
          id: q.id,
          entityId: q.entity_id,
          entityName: q.entity_name,
          text: q.text,
          source: q.source,
        },
      })
    }
    for (const q of semanticQuotes) {
      const sim = cosineScore(q.distance)
      const existing = map.get(q.id)
      if (existing) {
        existing.semantic = sim
        existing.score = existing.lexical + sim
      } else {
        map.set(q.id, {
          score: sim,
          lexical: 0,
          semantic: sim,
          payload: {
            id: q.id,
            entityId: q.entity_id,
            entityName: q.entity_name,
            text: q.text,
            source: q.source,
          },
        })
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((m) => ({ ...m.payload, score: m.score, lexical: m.lexical, semantic: m.semantic }))
  }

  return Response.json({
    entities: mergeEntities(),
    quotes: mergeQuotes(),
    mode,
  })
}

export const config: Config = {
  path: '/api/search',
}
