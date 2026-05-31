import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logEvent } from './_lib/observability.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import {
  embedSafe,
  entityEmbeddingText,
  quoteEmbeddingText,
  toPgVector,
} from './_lib/embeddings.js'

const EMBEDDING_COST_CENTS_PER_TOKEN = 2 / 1_000_000 // $0.02 / 1M tokens

function estimateEmbeddingTokens(text: string): number {
  return Math.ceil(text.trim().length / 4)
}

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
  const authedUser = await getAuthedUser(req)
  const { id: userId } = authedUser
  const sql = getSql()

  if (req.method === 'GET') {
    const [eRows, qRows] = await Promise.all([
      sqlTyped<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM entities WHERE deleted_at IS NULL AND embedding IS NULL AND user_id = ${userId}`),
      sqlTyped<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM quotes WHERE deleted_at IS NULL AND embedding IS NULL AND user_id = ${userId}`),
    ])
    return Response.json({
      entities: Number(eRows[0]?.c ?? 0),
      quotes: Number(qRows[0]?.c ?? 0),
    })
  }

  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  await ensureUserRow(sql, authedUser)

  const url = new URL(req.url)
  const batchSize = Math.min(
    Math.max(Number.parseInt(url.searchParams.get('batch') ?? '25', 10) || 25, 1),
    100,
  )

  let processed = 0
  let attempted = 0
  let estimatedTokens = 0
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
    WHERE deleted_at IS NULL AND embedding IS NULL AND user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${batchSize}
  `) as EntityRow[]

  for (const e of entityRows) {
    const text = entityEmbeddingText({
      name: e.name,
      type: e.type,
      year: e.year,
      description: e.description,
    })
    attempted += 1
    estimatedTokens += estimateEmbeddingTokens(text)
    const emb = await embedSafe(text)
    if (!emb) {
      errors.push({ kind: 'entity', id: e.id, reason: 'embedding falló' })
      continue
    }
    await sql`
      UPDATE entities
      SET embedding = ${toPgVector(emb.vector)}::vector,
          embedding_model = ${emb.model},
          embedding_at = NOW()
      WHERE id = ${e.id} AND deleted_at IS NULL AND user_id = ${userId}
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
      LEFT JOIN entities e ON e.id = q.entity_id
        AND e.deleted_at IS NULL
        AND e.user_id = ${userId}
      WHERE q.deleted_at IS NULL AND q.embedding IS NULL AND q.user_id = ${userId}
      ORDER BY q.created_at DESC
      LIMIT ${remainingCapacity}
    `) as QuoteRow[]

    for (const q of quoteRows) {
      const text = quoteEmbeddingText({
        text: q.text,
        entityName: q.entity_name,
        source: q.source,
        context: q.context,
      })
      attempted += 1
      estimatedTokens += estimateEmbeddingTokens(text)
      const emb = await embedSafe(text)
      if (!emb) {
        errors.push({ kind: 'quote', id: q.id, reason: 'embedding falló' })
        continue
      }
      await sql`
        UPDATE quotes
        SET embedding = ${toPgVector(emb.vector)}::vector,
            embedding_model = ${emb.model},
            embedding_at = NOW()
        WHERE id = ${q.id} AND deleted_at IS NULL AND user_id = ${userId}
      `
      processed += 1
    }
  }

  const [eLeft, qLeft] = await Promise.all([
    sqlTyped<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM entities WHERE deleted_at IS NULL AND embedding IS NULL AND user_id = ${userId}`),
    sqlTyped<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM quotes WHERE deleted_at IS NULL AND embedding IS NULL AND user_id = ${userId}`),
  ])

  logEvent({
    event: 'reindex_embeddings_batch',
    userId,
    attempted,
    processed,
    errors: errors.length,
    estimatedTokens,
    estimatedCostCents: Number(
      (estimatedTokens * EMBEDDING_COST_CENTS_PER_TOKEN).toFixed(6),
    ),
    remainingEntities: Number(eLeft[0]?.c ?? 0),
    remainingQuotes: Number(qLeft[0]?.c ?? 0),
  })

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
