import { getSql, sqlTyped } from './db.js'
import { embedSafe, toPgVector } from './embeddings.js'
import { describeEntity, describeQuote, llmRerank } from './llm-rerank.js'
import { resolveAIInvocation } from './ai-mode.js'
import { withObservability } from './handler-wrap.js'
import { getAuthedUser } from './auth.js'
import { parseSearchParams, QueryParam, requireMethod } from './request-contracts.js'
import { z } from 'zod'
import {
  buildEmptySearchPayload,
  buildSearchModePlan,
  buildSearchResponse,
  fuseSearchBranches,
  fuseSingleSearchBranch,
  type ChatSearchItem,
  type CronicaSearchItem,
  type EntitySearchItem,
  type MomentoSearchItem,
  type QuoteSearchItem,
  type SearchMode,
} from './search-service.js'

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
const SearchQueryParams = z.object({
  q: z.preprocess(QueryParam.trimmedString({ max: 500 }).normalize, z.string().max(500)),
  limit: z.preprocess(
    QueryParam.clampedInteger({ defaultValue: 15, min: 1, max: 50 }).normalize,
    z.number().int().min(1).max(50),
  ),
  mode: z.preprocess(
    (value) => {
      if (value === undefined || value === '') return 'hybrid'
      return typeof value === 'string' ? value.toLowerCase() : value
    },
    z.enum(['hybrid', 'lexical', 'semantic']),
  ),
  rerank: z.preprocess(
    QueryParam.boolean({ defaultValue: false }).normalize,
    z.boolean(),
  ),
})

export default withObservability('search', async (req: Request, _ctx, { requestId }) => {
  const methodError = requireMethod(req, requestId, ['GET'])
  if (methodError) return methodError
  const { id: userId } = await getAuthedUser(req, {
    requestId,
    operation: 'search.read',
  })
  const sql = getSql()

  const parsedQuery = parseSearchParams(req, SearchQueryParams, requestId)
  if (!parsedQuery.ok) return parsedQuery.response
  const { q, limit, mode, rerank: wantsRerank } = parsedQuery.data
  // ?rerank=true activa el LLM-as-reranker (lento, ~1-2s; alta calidad).
  // No lo usa la sidebar (que debe ser fast). Sí lo usa el chat RAG.

  if (!q) {
    return Response.json(buildEmptySearchPayload())
  }

  const { wantsLexical, wantsSemantic, fusedWidth } = buildSearchModePlan(
    mode as SearchMode,
    limit,
    wantsRerank,
  )

  // Lexical: tsvector match + trigram-similarity boost on name.
  type EntityLex = EntitySearchItem & { rank: number }
  type QuoteLex = QuoteSearchItem & { rank: number }
  type MomentoLex = MomentoSearchItem & { rank: number }
  type CronicaLex = CronicaSearchItem & { rank: number }
  type ChatLex = ChatSearchItem & { rank: number }

  // Texto representativo de un momento: el cuerpo si lo hay, si no el
  // caption/título/fuente, si no la nota. NULLIF descarta strings vacías del
  // payload para que el COALESCE caiga al siguiente campo con texto. Se
  // inlinea en cada query (en vez de un fragmento sql compartido) porque el
  // tagged template de Neon HTTP no compone fragmentos anidados.

  const lexicalEntities = wantsLexical
    ? await sqlTyped<EntityLex>(sql`
        SELECT e.id, e.name, e.type, e.description, e.year,
               ts_rank(e.search_vector, websearch_to_tsquery('simple', ${q}))
                 + similarity(e.name, ${q}) * 0.5 AS rank
        FROM entities e
        WHERE e.deleted_at IS NULL
          AND e.user_id = ${userId}
          AND (e.search_vector @@ websearch_to_tsquery('simple', ${q})
               OR e.name % ${q})
        ORDER BY rank DESC
        LIMIT ${limit * 2}
      `)
    : ([] as EntityLex[])

  const lexicalQuotes = wantsLexical
    ? await sqlTyped<QuoteLex>(sql`
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
        LIMIT ${limit * 2}
      `)
    : ([] as QuoteLex[])

  const lexicalMomentos = wantsLexical
    ? await sqlTyped<MomentoLex>(sql`
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
        LIMIT ${limit * 2}
      `)
    : ([] as MomentoLex[])

  // Crónicas y chat: lexical-only (no tienen embedding). En modo 'semantic'
  // puro no aparecen; en 'hybrid' fluyen por la rama léxica.
  const lexicalCronicas = wantsLexical
    ? await sqlTyped<CronicaLex>(sql`
        SELECT c.id, c.year, c.month, left(c.text, 220) AS text,
               ts_rank(c.search_vector, websearch_to_tsquery('simple', ${q})) AS rank
        FROM cronicas c
        WHERE c.user_id = ${userId}
          AND c.search_vector @@ websearch_to_tsquery('simple', ${q})
        ORDER BY rank DESC
        LIMIT ${limit * 2}
      `)
    : ([] as CronicaLex[])

  const lexicalChat = wantsLexical
    ? await sqlTyped<ChatLex>(sql`
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
        LIMIT ${limit * 2}
      `)
    : ([] as ChatLex[])

  // Semantic: embed the query, rank by cosine distance. embedSafe returns
  // null on any failure so we degrade to lexical instead of erroring.
  type SemanticEntity = EntityLex & { distance: number }
  type SemanticQuote = QuoteLex & { distance: number }
  type SemanticMomento = MomentoLex & { distance: number }

  let semanticEntities: SemanticEntity[] = []
  let semanticQuotes: SemanticQuote[] = []
  let semanticMomentos: SemanticMomento[] = []
  if (wantsSemantic) {
    const emb = await embedSafe(q)
    if (emb) {
      const pgVec = toPgVector(emb.vector)
      const [er, qr, mr] = await Promise.all([
        sqlTyped<SemanticEntity>(sql`
          SELECT id, name, type, description, year,
                 0 AS rank,
                 (embedding <=> ${pgVec}::vector) AS distance
          FROM entities
          WHERE deleted_at IS NULL AND embedding IS NOT NULL
            AND user_id = ${userId}
          ORDER BY embedding <=> ${pgVec}::vector
          LIMIT ${limit * 2}
        `),
        sqlTyped<SemanticQuote>(sql`
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
          LIMIT ${limit * 2}
        `),
        sqlTyped<SemanticMomento>(sql`
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
          LIMIT ${limit * 2}
        `),
      ])
      semanticEntities = er
      semanticQuotes = qr
      semanticMomentos = mr
    }
  }

  const lex = await lexicalEntities
  const lexQ = await lexicalQuotes
  const lexM = await lexicalMomentos
  const lexC = await lexicalCronicas
  const lexChat = await lexicalChat

  // ---------- Merge via Reciprocal Rank Fusion ----------
  // Antes sumábamos scores de escalas distintas (ts_rank vs cosine sim).
  // RRF descarta los scores y se queda con los RANKINGS. Mejor stability
  // cuando una rama trae noise, mejor combinación cuando ambas tienen señal.
  // Ver _lib/rrf.ts para el detalle.

  const entitiesFusedFull = fuseSearchBranches(lex, semanticEntities, fusedWidth)
  const quotesFusedFull = fuseSearchBranches(lexQ, semanticQuotes, fusedWidth)
  // Momentos: léxico + semántico. Crónicas y chat: una sola rama léxica
  // (fuseRanked de una lista = ranking por esa lista, mismo shape de salida).
  const momentosFused = fuseSearchBranches(lexM, semanticMomentos, limit)
  const cronicasFused = fuseSingleSearchBranch(lexC, limit)
  const chatFused = fuseSingleSearchBranch(lexChat, limit)

  // ---------- Rerank opcional vía LLM ----------
  // Solo si el caller lo pidió (?rerank=true). El LLM-as-reranker reordena
  // candidates ya rankeados por RRF, con una cabeza más sofisticada que
  // cosine + tsvector. Mejor relevancia, pero +1-2s de latencia.
  let entitiesReorderedIds: string[] | null = null
  let quotesReorderedIds: string[] | null = null
  if (wantsRerank) {
    const invocation = await resolveAIInvocation(req, 'chat', userId).catch(() => null)
    if (invocation?.kind === 'ready') {
      const override = { provider: invocation.provider, model: invocation.model }

      if (entitiesFusedFull.length > 1) {
        entitiesReorderedIds = await llmRerank(
          q,
          entitiesFusedFull.map((e) => ({
            id: e.item.id,
            text: describeEntity(e.item),
          })),
          {
            override,
            observability: {
              sql,
              userId,
              requestId,
              scope: 'search.entities',
            },
          },
        )
      }
      if (quotesFusedFull.length > 1) {
        quotesReorderedIds = await llmRerank(
          q,
          quotesFusedFull.map((q) => ({
            id: q.item.id,
            text: describeQuote({
              text: q.item.text,
              entityName: q.item.entity_name,
              source: q.item.source,
            }),
          })),
          {
            override,
            observability: {
              sql,
              userId,
              requestId,
              scope: 'search.quotes',
            },
          },
        )
      }
    }
  }

  return Response.json(
    buildSearchResponse({
      mode: mode as SearchMode,
      wantsRerank,
      limit,
      entitiesFused: entitiesFusedFull,
      quotesFused: quotesFusedFull,
      momentosFused,
      cronicasFused,
      chatFused,
      entitiesReorderedIds,
      quotesReorderedIds,
    }),
  )
})
