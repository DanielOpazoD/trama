/**
 * S4: helpers para chat-messages.mts.
 *
 * Antes el handler era 410 LOC monolítico con dos branches de context
 * loading (focusEntity vs RAG) inline. Acá quedan extraídas como
 * funciones puras: chat-messages las invoca según el caso y arma el
 * `ChatTramaContext` sin tener que tener 70 LOC de SQL embebido en
 * el handler.
 *
 * Esto NO toca el flujo de streaming ni el persist post-stream — esos
 * pasos siguen en chat-messages porque dependen del `controller` y
 * el state local del handler.
 */

import type { ChatTramaContext } from './chat-prompt.js'
import { sqlTyped, type SqlClient } from './db.js'
import { buildRagContext } from './rag-context.js'

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
export type TypeRow = { slug: string }

export type LoadedChatContext = {
  tramaContext: ChatTramaContext
  entityTypes: string[]
  relationshipTypes: string[]
  usedRag: boolean
  usedHyde: boolean
}

const FALLBACK_ENTITY_TYPES = [
  'persona',
  'escritor',
  'filosofo',
  'musico',
  'banda',
  'director',
  'artista',
  'cientifico',
  'libro',
  'ensayo',
  'poema',
  'articulo',
  'cancion',
  'podcast',
  'album',
  'disco',
  'pelicula',
  'serie',
  'documental',
  'obra',
  'concepto',
  'idea',
  'lugar',
  'evento',
]
const FALLBACK_RELATIONSHIP_TYPES = [
  'influye_en',
  'cita_a',
  'responde_a',
  'me_llego_por',
  'suena_como',
  'inspira',
  'contradice',
  'asociado_con',
]

/**
 * Branch "focusEntity": carga la entidad foco + sus vecinos directos +
 * sus citas. Cuando un hilo está pinned a una entidad específica, el
 * contexto debe ser local — no traemos RAG global.
 */
export async function loadChatContextForFocus(
  sql: SqlClient,
  focusEntityId: string,
  userId: string,
): Promise<LoadedChatContext> {
  const [entityRows, relRows, quoteRows, entityTypeRows, relTypeRows] = await Promise.all(
    [
      sqlTyped<EntityCtxRow>(sql`
      SELECT id, name, type, year, description
      FROM entities
      WHERE deleted_at IS NULL
        AND user_id = ${userId}
        AND (id = ${focusEntityId}
             OR id IN (
               SELECT CASE WHEN from_id = ${focusEntityId} THEN to_id ELSE from_id END
               FROM relationships
               WHERE deleted_at IS NULL
                 AND user_id = ${userId}
                 AND (from_id = ${focusEntityId} OR to_id = ${focusEntityId})
             ))
    `),
      sqlTyped<RelCtxRow>(sql`
      SELECT r.id, ef.name AS from_name, et.name AS to_name, r.type, r.notes
      FROM relationships r
      JOIN entities ef ON ef.id = r.from_id
        AND ef.deleted_at IS NULL
        AND ef.user_id = ${userId}
      JOIN entities et ON et.id = r.to_id
        AND et.deleted_at IS NULL
        AND et.user_id = ${userId}
      WHERE r.deleted_at IS NULL
        AND r.user_id = ${userId}
        AND (r.from_id = ${focusEntityId} OR r.to_id = ${focusEntityId})
      ORDER BY r.created_at DESC
    `),
      sqlTyped<QuoteCtxRow>(sql`
      SELECT q.id, e.name AS entity_name, q.text, q.source
      FROM quotes q
      JOIN entities e ON e.id = q.entity_id
        AND e.deleted_at IS NULL
        AND e.user_id = ${userId}
      WHERE q.deleted_at IS NULL
        AND q.user_id = ${userId}
        AND q.entity_id = ${focusEntityId}
      ORDER BY q.created_at DESC
    `),
      sqlTyped<TypeRow>(sql`SELECT slug FROM entity_types ORDER BY sort_order, slug`),
      sqlTyped<TypeRow>(
        sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug`,
      ),
    ],
  )

  return {
    tramaContext: shapeContext(entityRows, relRows, quoteRows),
    entityTypes: resolveTypeSlugs(entityTypeRows, FALLBACK_ENTITY_TYPES),
    relationshipTypes: resolveTypeSlugs(relTypeRows, FALLBACK_RELATIONSHIP_TYPES),
    usedRag: false,
    usedHyde: false,
  }
}

/**
 * Branch "general chat": RAG (semantic top-K + recency + opcional
 * LLM-as-reranker + HyDE). Escala a tramas grandes y trae lo topical
 * aunque sea histórico.
 */
export async function loadChatContextWithRag(
  sql: SqlClient,
  userText: string,
  userId: string,
  invocation: { provider: string | undefined; model: string | null },
  relationshipLimit: number,
): Promise<LoadedChatContext> {
  const [ragCtx, eTypes, rTypes] = await Promise.all([
    buildRagContext(sql, userText, userId, {
      relationshipLimit,
      // Activamos LLM-as-reranker en el chat — la calidad del
      // contexto importa más que los ~1-2s de latencia extra.
      rerank: true,
      rerankOverride: {
        provider: invocation.provider,
        model: invocation.model,
      },
      // HyDE: el chat es donde más rinde, las queries suelen ser
      // vagas y abstractas ("¿qué hay del tiempo en mis citas?").
      hyde: true,
    }),
    sqlTyped<TypeRow>(sql`SELECT slug FROM entity_types ORDER BY sort_order, slug`),
    sqlTyped<TypeRow>(sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug`),
  ])

  return {
    tramaContext: shapeContext(ragCtx.entities, ragCtx.relationships, ragCtx.quotes),
    entityTypes: resolveTypeSlugs(eTypes, FALLBACK_ENTITY_TYPES),
    relationshipTypes: resolveTypeSlugs(rTypes, FALLBACK_RELATIONSHIP_TYPES),
    usedRag: ragCtx.usedRag,
    usedHyde: ragCtx.usedHyde ?? false,
  }
}

function resolveTypeSlugs(rows: TypeRow[], fallback: string[]): string[] {
  const slugs = rows.map((r) => r.slug.trim()).filter(Boolean)
  return slugs.length > 0 ? slugs : fallback
}

function shapeContext(
  entityRows: EntityCtxRow[],
  relRows: RelCtxRow[],
  quoteRows: QuoteCtxRow[],
): ChatTramaContext {
  return {
    entities: entityRows.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      year: e.year,
      description: e.description,
    })),
    relationships: relRows.map((r) => ({
      id: r.id,
      fromName: r.from_name,
      toName: r.to_name,
      type: r.type,
      notes: r.notes,
    })),
    quotes: quoteRows.map((q) => ({
      id: q.id,
      entityName: q.entity_name,
      text: q.text,
      source: q.source,
    })),
  }
}
