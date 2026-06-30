import type { getSql } from './db.js'
import { sqlTyped } from './db.js'
import { embedSafe, toPgVector } from './embeddings.js'
import { parseRows } from './row-parse.js'
import {
  SearchChatRowSchema,
  SearchCronicaRowSchema,
  SearchEntityRowSchema,
  SearchMomentoRowSchema,
  SearchQuoteRowSchema,
  SearchSemanticEntityRowSchema,
  SearchSemanticMomentoRowSchema,
  SearchSemanticQuoteRowSchema,
  type SearchChatRow,
  type SearchCronicaRow,
  type SearchEntityRow,
  type SearchMomentoRow,
  type SearchQuoteRow,
  type SearchSemanticEntityRow,
  type SearchSemanticMomentoRow,
  type SearchSemanticQuoteRow,
} from './backend-row-schemas.js'

type SqlClient = ReturnType<typeof getSql>

export type LexicalSearchResult = {
  entities: SearchEntityRow[]
  quotes: SearchQuoteRow[]
  momentos: SearchMomentoRow[]
  cronicas: SearchCronicaRow[]
  chat: SearchChatRow[]
}

export type SemanticSearchResult = {
  entities: SearchSemanticEntityRow[]
  quotes: SearchSemanticQuoteRow[]
  momentos: SearchSemanticMomentoRow[]
}

export async function runLexicalSearch({
  sql,
  q,
  userId,
  limit,
  enabled,
}: {
  sql: SqlClient
  q: string
  userId: string
  limit: number
  enabled: boolean
}): Promise<LexicalSearchResult> {
  if (!enabled) {
    return { entities: [], quotes: [], momentos: [], cronicas: [], chat: [] }
  }
  const width = limit * 2
  const [entities, quotes, momentos, cronicas, chat] = await Promise.all([
    parseRows(
      await sqlTyped<SearchEntityRow>(sql`
        SELECT e.id, e.name, e.type, e.description, e.year,
               ts_rank(e.search_vector, websearch_to_tsquery('simple', ${q}))
                 + similarity(e.name, ${q}) * 0.5 AS rank
        FROM entities e
        WHERE e.deleted_at IS NULL
          AND e.user_id = ${userId}
          AND (e.search_vector @@ websearch_to_tsquery('simple', ${q})
               OR e.name % ${q})
        ORDER BY rank DESC
        LIMIT ${width}
      `),
      SearchEntityRowSchema,
      'search.lexical.entities',
    ),
    parseRows(
      await sqlTyped<SearchQuoteRow>(sql`
        SELECT q.id, q.entity_id, e.name AS entity_name, q.text, q.source,
               ts_rank(q.search_vector, websearch_to_tsquery('simple', ${q})) AS rank
        FROM quotes q
        JOIN entities e ON e.id = q.entity_id
          AND e.deleted_at IS NULL
          AND e.user_id = ${userId}
        WHERE q.deleted_at IS NULL
          AND q.user_id = ${userId}
          AND q.search_vector @@ websearch_to_tsquery('simple', ${q})
        ORDER BY rank DESC
        LIMIT ${width}
      `),
      SearchQuoteRowSchema,
      'search.lexical.quotes',
    ),
    parseRows(
      await sqlTyped<SearchMomentoRow>(sql`
        SELECT m.id, m.kind, m.captured_at,
               COALESCE(NULLIF(m.payload->>'bodyText', ''), NULLIF(m.payload->>'caption', ''),
                        NULLIF(m.payload->>'title', ''), NULLIF(m.payload->>'source', ''),
                        m.note, '') AS text,
               ts_rank(m.search_vector, websearch_to_tsquery('simple', ${q})) AS rank
        FROM momentos m
        WHERE m.deleted_at IS NULL
          AND m.user_id = ${userId}
          AND m.search_vector @@ websearch_to_tsquery('simple', ${q})
        ORDER BY rank DESC
        LIMIT ${width}
      `),
      SearchMomentoRowSchema,
      'search.lexical.momentos',
    ),
    parseRows(
      await sqlTyped<SearchCronicaRow>(sql`
        SELECT c.id, c.year, c.month, left(c.text, 220) AS text,
               ts_rank(c.search_vector, websearch_to_tsquery('simple', ${q})) AS rank
        FROM cronicas c
        WHERE c.user_id = ${userId}
          AND c.search_vector @@ websearch_to_tsquery('simple', ${q})
        ORDER BY rank DESC
        LIMIT ${width}
      `),
      SearchCronicaRowSchema,
      'search.lexical.cronicas',
    ),
    parseRows(
      await sqlTyped<SearchChatRow>(sql`
        SELECT cm.id, cm.thread_id, t.title AS thread_title, cm.role,
               left(cm.content, 200) AS text,
               ts_rank(cm.search_vector, websearch_to_tsquery('simple', ${q})) AS rank
        FROM chat_messages cm
        JOIN chat_threads t ON t.id = cm.thread_id
          AND t.deleted_at IS NULL
          AND t.user_id = ${userId}
        WHERE t.deleted_at IS NULL
          AND cm.user_id = ${userId}
          AND cm.search_vector @@ websearch_to_tsquery('simple', ${q})
        ORDER BY rank DESC
        LIMIT ${width}
      `),
      SearchChatRowSchema,
      'search.lexical.chat',
    ),
  ])
  return { entities, quotes, momentos, cronicas, chat }
}

export async function runSemanticSearch({
  sql,
  q,
  userId,
  limit,
  enabled,
}: {
  sql: SqlClient
  q: string
  userId: string
  limit: number
  enabled: boolean
}): Promise<SemanticSearchResult> {
  if (!enabled) return { entities: [], quotes: [], momentos: [] }
  const emb = await embedSafe(q)
  if (!emb) return { entities: [], quotes: [], momentos: [] }
  const pgVec = toPgVector(emb.vector)
  const width = limit * 2
  const [entities, quotes, momentos] = await Promise.all([
    parseRows(
      await sqlTyped<SearchSemanticEntityRow>(sql`
        SELECT id, name, type, description, year,
               0 AS rank,
               (embedding <=> ${pgVec}::vector) AS distance
        FROM entities
        WHERE deleted_at IS NULL AND embedding IS NOT NULL
          AND user_id = ${userId}
        ORDER BY embedding <=> ${pgVec}::vector
        LIMIT ${width}
      `),
      SearchSemanticEntityRowSchema,
      'search.semantic.entities',
    ),
    parseRows(
      await sqlTyped<SearchSemanticQuoteRow>(sql`
        SELECT q.id, q.entity_id, e.name AS entity_name,
               q.text, q.source,
               0 AS rank,
               (q.embedding <=> ${pgVec}::vector) AS distance
        FROM quotes q
        JOIN entities e ON e.id = q.entity_id
          AND e.deleted_at IS NULL
          AND e.user_id = ${userId}
        WHERE q.deleted_at IS NULL AND q.embedding IS NOT NULL
          AND q.user_id = ${userId}
        ORDER BY q.embedding <=> ${pgVec}::vector
        LIMIT ${width}
      `),
      SearchSemanticQuoteRowSchema,
      'search.semantic.quotes',
    ),
    parseRows(
      await sqlTyped<SearchSemanticMomentoRow>(sql`
        SELECT m.id, m.kind, m.captured_at,
               COALESCE(NULLIF(m.payload->>'bodyText', ''), NULLIF(m.payload->>'caption', ''),
                        NULLIF(m.payload->>'title', ''), NULLIF(m.payload->>'source', ''),
                        m.note, '') AS text,
               0 AS rank,
               (m.embedding <=> ${pgVec}::vector) AS distance
        FROM momentos m
        WHERE m.deleted_at IS NULL AND m.embedding IS NOT NULL
          AND m.user_id = ${userId}
        ORDER BY m.embedding <=> ${pgVec}::vector
        LIMIT ${width}
      `),
      SearchSemanticMomentoRowSchema,
      'search.semantic.momentos',
    ),
  ])
  return { entities, quotes, momentos }
}
