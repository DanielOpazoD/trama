import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import {
  embedSafe,
  entityEmbeddingText,
  quoteEmbeddingText,
  toPgVector,
} from './_lib/embeddings.js'

/**
 * Backfill embeddings for entities and quotes that don't have one yet.
 *
 * GET  /api/reindex-embeddings → returns counts: { entities, quotes } pending
 * POST /api/reindex-embeddings → processes one batch (default 25 rows) and
 *   returns { processed, remaining }. The UI can poll until remaining = 0.
 *
 * Batching keeps each invocation under Netlify's 10s default timeout and
 * lets the user watch progress instead of staring at a spinner.
 *
 * Order of operations: entities first (so quotes inherit the up-to-date
 * entity name in their embedding text), then quotes.
 */
export default withObservability('reindex-embeddings', async (req, _ctx, { requestId }) => {
  const sql = getSql()

  if (req.method === 'GET') {
    const [eRows, qRows] = await Promise.all([
      sql`SELECT COUNT(*)::text AS c FROM entities WHERE deleted_at IS NULL AND embedding IS NULL` as unknown as Promise<Array<{ c: string }>>,
      sql`SELECT COUNT(*)::text AS c FROM quotes WHERE deleted_at IS NULL AND embedding IS NULL` as unknown as Promise<Array<{ c: string }>>,
    ])
    return Response.json({
      entities: Number(eRows[0]?.c ?? 0),
      quotes: Number(qRows[0]?.c ?? 0),
    })
  }

  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const url = new URL(req.url)
  const batchSize = Math.min(
    Math.max(Number.parseInt(url.searchParams.get('batch') ?? '25', 10) || 25, 1),
    100,
  )

  let processed = 0
  const errors: Array<{ kind: 'entity' | 'quote'; id: string; reason: string }> = []

  // ---------- entities ----------
  type EntityRow = {
    id: string
    name: string
    type: string
    year: number | null
    description: string | null
  }
  const entityRows = (await sql`
    SELECT id, name, type, year, description
    FROM entities
    WHERE deleted_at IS NULL AND embedding IS NULL
    ORDER BY created_at DESC
    LIMIT ${batchSize}
  `) as EntityRow[]

  for (const e of entityRows) {
    const emb = await embedSafe(
      entityEmbeddingText({
        name: e.name,
        type: e.type,
        year: e.year,
        description: e.description,
      }),
    )
    if (!emb) {
      errors.push({ kind: 'entity', id: e.id, reason: 'embedding falló' })
      continue
    }
    await sql`
      UPDATE entities
      SET embedding = ${toPgVector(emb.vector)}::vector,
          embedding_model = ${emb.model},
          embedding_at = NOW()
      WHERE id = ${e.id}
    `
    processed += 1
  }

  // ---------- quotes ---------- (only run if we have capacity left in the batch)
  if (processed < batchSize) {
    const remainingCapacity = batchSize - processed
    type QuoteRow = {
      id: string
      text: string
      source: string | null
      context: string | null
      entity_name: string | null
    }
    const quoteRows = (await sql`
      SELECT q.id, q.text, q.source, q.context, e.name AS entity_name
      FROM quotes q
      LEFT JOIN entities e ON e.id = q.entity_id AND e.deleted_at IS NULL
      WHERE q.deleted_at IS NULL AND q.embedding IS NULL
      ORDER BY q.created_at DESC
      LIMIT ${remainingCapacity}
    `) as QuoteRow[]

    for (const q of quoteRows) {
      const emb = await embedSafe(
        quoteEmbeddingText({
          text: q.text,
          entityName: q.entity_name,
          source: q.source,
          context: q.context,
        }),
      )
      if (!emb) {
        errors.push({ kind: 'quote', id: q.id, reason: 'embedding falló' })
        continue
      }
      await sql`
        UPDATE quotes
        SET embedding = ${toPgVector(emb.vector)}::vector,
            embedding_model = ${emb.model},
            embedding_at = NOW()
        WHERE id = ${q.id}
      `
      processed += 1
    }
  }

  const [eLeft, qLeft] = await Promise.all([
    sql`SELECT COUNT(*)::text AS c FROM entities WHERE deleted_at IS NULL AND embedding IS NULL` as unknown as Promise<Array<{ c: string }>>,
    sql`SELECT COUNT(*)::text AS c FROM quotes WHERE deleted_at IS NULL AND embedding IS NULL` as unknown as Promise<Array<{ c: string }>>,
  ])

  return Response.json({
    processed,
    remaining: {
      entities: Number(eLeft[0]?.c ?? 0),
      quotes: Number(qLeft[0]?.c ?? 0),
    },
    errors,
  })
})

export const config: Config = {
  path: '/api/reindex-embeddings',
}
