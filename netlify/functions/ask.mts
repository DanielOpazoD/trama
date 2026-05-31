import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { askLLMForJson } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { buildAskPrompt, type AskContext } from './_lib/ask-prompt.js'
import { validateExtraction } from './_lib/extract-validate.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { AskBody } from './_lib/chat-body-schemas.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { buildRagContext } from './_lib/rag-context.js'
import { ensureUserRow } from './_lib/user-provisioning.js'

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

// Legacy context limits, kept as fallback for the (very rare) case where
// buildRagContext doesn't apply (e.g., empty query) — though in practice
// ask.mts always has a userText so RAG always runs.
const FALLBACK_REL_LIMIT = 100

type ViewSlug = AskContext['view']
const VALID_VIEWS: ViewSlug[] = [
  'grafo',
  'entidades',
  'citas',
  'relaciones',
  'escuchas',
  'chat',
  'sugerencias',
]

export default withObservability('ask', async (req, _ctx, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const parsed = await parseJsonBody(req, AskBody, requestId)
  if (!parsed.ok) return parsed.response
  const body = parsed.data
  const userText = body.text.trim()
  if (!userText) {
    return ApiErrors.validation(requestId, 'Falta el campo "text"')
  }

  const view: ViewSlug =
    body.view && (VALID_VIEWS as string[]).includes(body.view)
      ? (body.view as ViewSlug)
      : null

  const incomingThreadId =
    typeof body.threadId === 'string' && body.threadId.length > 0 ? body.threadId : null

  const authedUser = await getAuthedUser(req)
  const userId = authedUser.id

  const sql = getSql()
  await ensureUserRow(sql, authedUser)

  const budgetExceeded = await checkMonthlyBudget(userId, requestId)
  if (budgetExceeded) return budgetExceeded

  // Conversational history for this section thread, if any. Reused last N=10
  // turns (5 user + 5 assistant on average). Older turns drop off the prompt
  // but stay in the DB for the user to scroll through in ChatView.
  type HistoryRow = { role: 'user' | 'assistant'; content: string }
  let history: HistoryRow[] = []
  if (incomingThreadId) {
    const threadRows = await sqlTyped<{ id: string }>(sql`
      SELECT id
      FROM chat_threads
      WHERE id = ${incomingThreadId} AND deleted_at IS NULL AND user_id = ${userId}
    `)
    if (threadRows.length === 0) {
      return ApiErrors.notFound(requestId, 'Thread no encontrado')
    }
    const rows = await sqlTyped<HistoryRow>(sql`
      SELECT role, content
      FROM chat_messages
      WHERE thread_id = ${incomingThreadId} AND user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 10
    `)
    history = rows.slice().reverse()
  }

  type TypeRow = { slug: string }

  // Resolvemos el AI mode upfront para poder honrarlo en TODAS las llamadas
  // LLM (incluido el rerank). Si está en Off, salimos antes de cualquier
  // trabajo LLM, ahorrando latencia y tokens.
  const invocation = await resolveAIInvocation(req, 'chat', userId)
  if (invocation.kind === 'off') return aiOffResponse(requestId)
  const rerankOverride = {
    provider: invocation.provider,
    model: invocation.model,
  }

  // Retrieval-augmented context: semantic top-K + recency, merged, y
  // opcionalmente reordenado por el LLM como cross-encoder informal.
  const [ragCtx, entityTypeRows, relTypeRows, selectedRows] = await Promise.all([
    buildRagContext(sql, userText, userId, {
      relationshipLimit: FALLBACK_REL_LIMIT,
      rerank: true,
      rerankOverride,
      // HyDE on para queries con substancia. Para una captura
      // ("pega: cita...") no aporta; para "qué tengo sobre X" mejora
      // mucho el recall. La función lo desactiva sola si la query es
      // muy corta o larga.
      hyde: true,
    }),
    sqlTyped<TypeRow>(sql`SELECT slug FROM entity_types ORDER BY sort_order, slug`),
    sqlTyped<TypeRow>(sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug`),
    body.selectedEntityId
      ? sqlTyped<{
          id: string
          name: string
          type: string
          description: string | null
        }>(sql`SELECT id, name, type, description FROM entities
              WHERE id = ${body.selectedEntityId} AND deleted_at IS NULL AND user_id = ${userId}`)
      : Promise.resolve(
          [] as Array<{
            id: string
            name: string
            type: string
            description: string | null
          }>,
        ),
  ])

  const entityTypes =
    entityTypeRows.length > 0 ? entityTypeRows.map((r) => r.slug) : FALLBACK_ENTITY_TYPES
  const relationshipTypes =
    relTypeRows.length > 0 ? relTypeRows.map((r) => r.slug) : FALLBACK_RELATIONSHIP_TYPES

  const selected = selectedRows[0] ?? null

  const ctx: AskContext = {
    view,
    entities: ragCtx.entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      year: e.year,
      description: e.description,
    })),
    relationships: ragCtx.relationships.map((r) => ({
      id: r.id,
      fromName: r.from_name,
      toName: r.to_name,
      type: r.type,
    })),
    recentQuotes: ragCtx.quotes.map((q) => ({
      id: q.id,
      entityName: q.entity_name,
      text: q.text,
      source: q.source,
    })),
    entityTypes,
    relationshipTypes,
    selectedEntity: selected
      ? {
          id: selected.id,
          name: selected.name,
          type: selected.type,
          description: selected.description,
        }
      : null,
    history,
  }

  const messages = buildAskPrompt(userText, ctx)

  // invocation ya fue resuelto arriba (necesario para el rerank).
  try {
    const { content, usage, fromCache } = await askLLMForJson(messages, {
      provider: invocation.provider,
      model: invocation.model,
    })

    const raw = (content ?? {}) as {
      reply?: unknown
      proposal?: unknown
    }
    const reply = typeof raw.reply === 'string' ? raw.reply.trim() : ''

    // Build the existingIds maps so the validator can clean edits/deletes
    // against real rows. Without this the validator drops them entirely as
    // a safety default.
    const existingIds = {
      entities: new Map(ctx.entities.map((e) => [e.id, { name: e.name, type: e.type }])),
      quotes: new Map(
        ctx.recentQuotes.map((q) => [q.id, { text: q.text, entityName: q.entityName }]),
      ),
      relationships: new Map(
        ctx.relationships.map((r) => [
          r.id,
          { preview: `${r.fromName} → ${r.type} → ${r.toName}` },
        ]),
      ),
    }

    const cleanedProposal = validateExtraction(
      raw.proposal ?? {},
      ctx.entities,
      new Set(entityTypes),
      new Set(relationshipTypes),
      existingIds,
    )

    const hasProposal =
      cleanedProposal.entities.length +
        cleanedProposal.relationships.length +
        cleanedProposal.quotes.length +
        cleanedProposal.edits.length +
        cleanedProposal.deletes.length >
      0

    logEvent({
      event: 'ask_completed',
      provider: usage.provider,
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costCents: usage.costCents,
      durationMs: usage.durationMs,
      fromCache,
      view,
      hasSelected: !!ctx.selectedEntity,
      replyLen: reply.length,
      hasProposal,
      usedRag: ragCtx.usedRag,
      usedHyde: ragCtx.usedHyde ?? false,
      contextEntities: ctx.entities.length,
      contextQuotes: ctx.recentQuotes.length,
    })

    sql`
      INSERT INTO extraction_log (
        input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id
      ) VALUES (
        ${`ask:${view ?? 'none'}`},
        ${JSON.stringify({ reply, proposal: cleanedProposal })}::jsonb,
        ${usage.provider},
        ${usage.model},
        ${usage.tokensIn},
        ${usage.tokensOut},
        ${usage.costCents},
        ${usage.durationMs},
        ${userId}
      )
    `.catch(() => {})

    // Persist the turn to chat_messages so the AskBar has memory across
    // submissions. If the client didn't send a threadId yet we create one
    // tagged with the current view as its context.
    let activeThreadId: string | null = incomingThreadId
    if (!activeThreadId && view) {
      type TIdRow = { id: string }
      const created = await sqlTyped<TIdRow>(sql`
        INSERT INTO chat_threads (context, user_id) VALUES (${view}, ${userId}) RETURNING id
      `)
      activeThreadId = created[0]?.id ?? null
    }

    if (activeThreadId) {
      // Insert user message first, then assistant. We do them serially so
      // their created_at order matches the conversation order. Best-effort:
      // a failure here shouldn't break the response the user already sees.
      const proposalToStore = hasProposal ? cleanedProposal : null
      await sql`
        INSERT INTO chat_messages (thread_id, role, content, user_id)
        VALUES (${activeThreadId}, 'user', ${userText}, ${userId})
      `.catch(() => {})
      await sql`
        INSERT INTO chat_messages (
          thread_id, role, content, proposal,
          tokens_in, tokens_out, cost_cents, provider, model, user_id
        ) VALUES (
          ${activeThreadId},
          'assistant',
          ${reply},
          ${proposalToStore ? JSON.stringify(proposalToStore) : null}::jsonb,
          ${usage.tokensIn},
          ${usage.tokensOut},
          ${usage.costCents},
          ${usage.provider},
          ${usage.model},
          ${userId}
        )
      `.catch(() => {})
      // Bump the thread so it sorts to the top of the rail.
      await sql`UPDATE chat_threads SET updated_at = NOW() WHERE id = ${activeThreadId} AND user_id = ${userId}`.catch(
        () => {},
      )
    }

    return Response.json({
      reply,
      proposal: hasProposal
        ? { ...cleanedProposal, provider: usage.provider, model: usage.model }
        : null,
      provider: usage.provider,
      model: usage.model,
      threadId: activeThreadId,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return ApiErrors.upstream(requestId, `Error llamando al LLM: ${message}`)
  }
})

export const config: Config = {
  path: '/api/ask',
}
