import { getSql } from './db.js'
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
  type SearchMode,
} from './search-service.js'
import { runLexicalSearch, runSemanticSearch } from './search-endpoint-queries.js'

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

  const [lexical, semantic] = await Promise.all([
    runLexicalSearch({ sql, q, userId, limit, enabled: wantsLexical }),
    runSemanticSearch({ sql, q, userId, limit, enabled: wantsSemantic }),
  ])

  // ---------- Merge via Reciprocal Rank Fusion ----------
  // Antes sumábamos scores de escalas distintas (ts_rank vs cosine sim).
  // RRF descarta los scores y se queda con los RANKINGS. Mejor stability
  // cuando una rama trae noise, mejor combinación cuando ambas tienen señal.
  // Ver _lib/rrf.ts para el detalle.

  const entitiesFusedFull = fuseSearchBranches(
    lexical.entities,
    semantic.entities,
    fusedWidth,
  )
  const quotesFusedFull = fuseSearchBranches(lexical.quotes, semantic.quotes, fusedWidth)
  // Momentos: léxico + semántico. Crónicas y chat: una sola rama léxica
  // (fuseRanked de una lista = ranking por esa lista, mismo shape de salida).
  const momentosFused = fuseSearchBranches(lexical.momentos, semantic.momentos, limit)
  const cronicasFused = fuseSingleSearchBranch(lexical.cronicas, limit)
  const chatFused = fuseSingleSearchBranch(lexical.chat, limit)

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
