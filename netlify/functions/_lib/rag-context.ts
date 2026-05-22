/**
 * Trama context for chat/ask prompts — retrieval-augmented.
 *
 * Antes: "los últimos 80 entidades + 100 relaciones + 20 citas". A 100k
 * eso es ciego al pasado del usuario: si pregunta por un autor que añadió
 * hace dos años, no llega al prompt.
 *
 * Ahora: combinamos retrieval semántico (top-K por cosine sobre el
 * embedding de la pregunta) + un slice de recencia. Así el modelo recibe:
 *   - lo más topical para esta pregunta (aunque sea antiguo)
 *   - lo más fresco (incluso si nunca se embedó)
 *
 * Si el embedding falla (sin key, error de red), o si no hay suficientes
 * filas embebidas todavía, la retrieval semántica queda vacía y solo
 * funciona la rama de recencia. Degradación graceful.
 */

import { embedSafe, toPgVector } from './embeddings.js'
import { describeEntity, describeQuote, llmRerank } from './llm-rerank.js'
import type { LLMOverride } from './llm.js'

// Compact context rows shaped to feed the prompt builder. Mismas formas
// que las queries existentes en ask.mts / chat-messages.mts, así los
// call sites no cambian su shape interno.
export type EntityCtxRow = {
  id: string
  name: string
  type: string
  year: number | null
  description: string | null
}
export type RelCtxRow = {
  id: string
  from_name: string
  to_name: string
  type: string
  notes: string | null
}
export type QuoteCtxRow = {
  id: string
  entity_name: string
  text: string
  source: string | null
}

export type RagContext = {
  entities: EntityCtxRow[]
  relationships: RelCtxRow[]
  quotes: QuoteCtxRow[]
  /** true = al menos parte del contexto vino de retrieval semántico. */
  usedRag: boolean
}

type SqlClient = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown>

/**
 * Build trama context for a user query, blending semantic retrieval +
 * recency. Both halves get deduped by id when merged.
 *
 * Tunables:
 *   - semanticEntityLimit (default 30)
 *   - semanticQuoteLimit (default 15)
 *   - recentEntityLimit (default 20)
 *   - recentQuoteLimit (default 10)
 *   - relationshipLimit (default 100)
 */
export async function buildRagContext(
  sql: SqlClient,
  userQuery: string,
  options?: {
    semanticEntityLimit?: number
    semanticQuoteLimit?: number
    recentEntityLimit?: number
    recentQuoteLimit?: number
    relationshipLimit?: number
    /** Si true, después del retrieval pasa por un LLM-as-reranker.
        Mejora relevancia con costo de ~1-2s. Solo en chat (donde la
        latencia se acepta), nunca en sidebar. */
    rerank?: boolean
    /** Provider override para el reranker (mismo que el chat). */
    rerankOverride?: LLMOverride
  },
): Promise<RagContext> {
  const semE = options?.semanticEntityLimit ?? 30
  const semQ = options?.semanticQuoteLimit ?? 15
  const recE = options?.recentEntityLimit ?? 20
  const recQ = options?.recentQuoteLimit ?? 10
  const relCap = options?.relationshipLimit ?? 100

  // 1) Embed query (best-effort). On failure, semantic branch returns empty.
  const emb = userQuery.trim() ? await embedSafe(userQuery) : null
  const queryVec = emb ? toPgVector(emb.vector) : null

  // 2) Two parallel queries per table: semantic + recent.
  const [semanticEntities, recentEntities, semanticQuotes, recentQuotes] = await Promise.all([
    queryVec
      ? (sql`
          SELECT id, name, type, year, description
          FROM entities
          WHERE deleted_at IS NULL AND embedding IS NOT NULL
          ORDER BY embedding <=> ${queryVec}::vector
          LIMIT ${semE}
        ` as unknown as Promise<EntityCtxRow[]>)
      : Promise.resolve<EntityCtxRow[]>([]),
    sql`
      SELECT id, name, type, year, description
      FROM entities
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${recE}
    ` as unknown as Promise<EntityCtxRow[]>,
    queryVec
      ? (sql`
          SELECT q.id, e.name AS entity_name, q.text, q.source
          FROM quotes q
          JOIN entities e ON e.id = q.entity_id
          WHERE q.deleted_at IS NULL AND q.embedding IS NOT NULL
          ORDER BY q.embedding <=> ${queryVec}::vector
          LIMIT ${semQ}
        ` as unknown as Promise<QuoteCtxRow[]>)
      : Promise.resolve<QuoteCtxRow[]>([]),
    sql`
      SELECT q.id, e.name AS entity_name, q.text, q.source
      FROM quotes q
      JOIN entities e ON e.id = q.entity_id
      WHERE q.deleted_at IS NULL
      ORDER BY q.created_at DESC
      LIMIT ${recQ}
    ` as unknown as Promise<QuoteCtxRow[]>,
  ])

  // 3) Merge with dedupe (semantic first so its order is preserved).
  const entitiesById = new Map<string, EntityCtxRow>()
  for (const e of semanticEntities) entitiesById.set(e.id, e)
  for (const e of recentEntities) if (!entitiesById.has(e.id)) entitiesById.set(e.id, e)
  let entities = Array.from(entitiesById.values())

  const quotesById = new Map<string, QuoteCtxRow>()
  for (const q of semanticQuotes) quotesById.set(q.id, q)
  for (const q of recentQuotes) if (!quotesById.has(q.id)) quotesById.set(q.id, q)
  let quotes = Array.from(quotesById.values())

  // 3.5) Rerank opcional vía LLM. Solo cuando el caller lo pide y solo
  // si la query no es trivial — un usuario tecleando "Bo" no necesita
  // que un LLM razone sobre 30 candidatos.
  if (options?.rerank && userQuery.trim().length > 3) {
    const [reorderedEntityIds, reorderedQuoteIds] = await Promise.all([
      entities.length > 1
        ? llmRerank(
            userQuery,
            entities.map((e) => ({ id: e.id, text: describeEntity(e) })),
            { override: options.rerankOverride },
          )
        : Promise.resolve<string[] | null>(null),
      quotes.length > 1
        ? llmRerank(
            userQuery,
            quotes.map((q) => ({
              id: q.id,
              text: describeQuote({
                text: q.text,
                entityName: q.entity_name,
                source: q.source,
              }),
            })),
            { override: options.rerankOverride },
          )
        : Promise.resolve<string[] | null>(null),
    ])

    if (reorderedEntityIds) {
      const byId = new Map(entities.map((e) => [e.id, e]))
      const reranked: EntityCtxRow[] = []
      for (const id of reorderedEntityIds) {
        const e = byId.get(id)
        if (e) reranked.push(e)
      }
      entities = reranked
    }
    if (reorderedQuoteIds) {
      const byId = new Map(quotes.map((q) => [q.id, q]))
      const reranked: QuoteCtxRow[] = []
      for (const id of reorderedQuoteIds) {
        const q = byId.get(id)
        if (q) reranked.push(q)
      }
      quotes = reranked
    }
  }

  // 4) Relationships: bring in edges connecting any of the entities we
  // already selected. This keeps the prompt coherent (the model sees X,
  // Y, and the fact that X → influye_en → Y). Drop the rest.
  const entityIds = entities.map((e) => e.id)
  let relationships: RelCtxRow[] = []
  if (entityIds.length > 0) {
    relationships = (await sql`
      SELECT r.id, ef.name AS from_name, et.name AS to_name, r.type, r.notes
      FROM relationships r
      JOIN entities ef ON ef.id = r.from_id
      JOIN entities et ON et.id = r.to_id
      WHERE r.deleted_at IS NULL
        AND (r.from_id = ANY(${entityIds}::uuid[]) OR r.to_id = ANY(${entityIds}::uuid[]))
      ORDER BY r.created_at DESC
      LIMIT ${relCap}
    `) as RelCtxRow[]
  }

  return {
    entities,
    relationships,
    quotes,
    usedRag: semanticEntities.length > 0 || semanticQuotes.length > 0,
  }
}
