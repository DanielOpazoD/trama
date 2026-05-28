import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForText, askLLMForTextStreaming } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { buildRagContext } from './_lib/rag-context.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { ChatMessageSendBody } from './_lib/chat-body-schemas.js'
import {
  buildChatPrompt,
  buildChatTitlePrompt,
  type ChatTramaContext,
  type ChatTurn,
} from './_lib/chat-prompt.js'
import { parseChatReply, hasAnyProposal } from './_lib/chat-validate.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'

const FALLBACK_ENTITY_TYPES = [
  'persona', 'escritor', 'filosofo', 'musico', 'banda', 'director', 'artista', 'cientifico',
  'libro', 'ensayo', 'poema', 'articulo',
  'cancion', 'podcast', 'album', 'disco',
  'pelicula', 'serie', 'documental',
  'obra', 'concepto', 'idea', 'lugar', 'evento',
]
const FALLBACK_RELATIONSHIP_TYPES = [
  'influye_en', 'cita_a', 'responde_a', 'me_llego_por',
  'suena_como', 'inspira', 'contradice', 'asociado_con',
]

const HISTORY_LIMIT = 30
const CONTEXT_ENTITY_LIMIT = 80
const CONTEXT_RELATIONSHIP_LIMIT = 150
const CONTEXT_QUOTE_LIMIT = 60

export default withObservability(
  'chat-messages',
  async (req: Request, context: Context, { requestId }) => {
    const threadId = context.params.threadId
    if (!threadId) return ApiErrors.validation(requestId, 'thread id required')

    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    if (req.method === 'GET') {
      type Row = {
        id: string
        role: 'user' | 'assistant'
        content: string
        proposal: unknown
        created_at: string
        provider: string | null
        model: string | null
      }
      const rows = (await sql`
        SELECT id, role, content, proposal, created_at, provider, model
        FROM chat_messages
        WHERE thread_id = ${threadId}
        ORDER BY created_at ASC
        LIMIT 500
      `) as Row[]
      return Response.json(
        rows.map((r) => ({
          id: r.id,
          role: r.role,
          content: r.content,
          proposal: r.proposal,
          createdAt: r.created_at,
          provider: r.provider ?? undefined,
          model: r.model ?? undefined,
        })),
      )
    }

    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }

    const parsed = await parseJsonBody(req, ChatMessageSendBody, requestId)
    if (!parsed.ok) return parsed.response
    const userText = parsed.data.content.trim()
    if (!userText) {
      return ApiErrors.validation(requestId, 'Falta el campo "content"')
    }

    const budgetExceeded = await checkMonthlyBudget(userId)
    if (budgetExceeded) return budgetExceeded

    // Resolve AI mode upfront so we don't persist a user message that the
    // assistant can never answer (Off blocks the whole exchange).
    const invocation = await resolveAIInvocation(req, 'chat')
    if (invocation.kind === 'off') return aiOffResponse()

    const threadRows = (await sql`
      SELECT id, title, context FROM chat_threads WHERE id = ${threadId} AND deleted_at IS NULL
    `) as Array<{ id: string; title: string | null; context: string | null }>
    if (threadRows.length === 0) {
      return ApiErrors.notFound(requestId, 'Thread no encontrado')
    }
    const thread = threadRows[0]

    // Entity-focused threads have context = "entity:<uuid>". When present we
    // narrow the trama context fed to the model to that one entity + its
    // direct neighbors, so the model can sustain a focused conversation
    // about "this person/book/etc." without drowning in unrelated rows.
    const entityFocusMatch = thread.context?.match(/^entity:([0-9a-f-]{36})$/i)
    const focusEntityId = entityFocusMatch?.[1] ?? null

    // Persist user message first so it survives an LLM failure.
    type UserInsertRow = { id: string; created_at: string }
    const userRows = (await sql`
      INSERT INTO chat_messages (thread_id, role, content)
      VALUES (${threadId}, 'user', ${userText})
      RETURNING id, created_at
    `) as UserInsertRow[]
    const userMessage = {
      id: userRows[0].id,
      role: 'user' as const,
      content: userText,
      createdAt: userRows[0].created_at,
      proposal: null,
    }

    // Gather context.
    type HistoryRow = { role: 'user' | 'assistant'; content: string }
    const historyRows = (await sql`
      SELECT role, content
      FROM chat_messages
      WHERE thread_id = ${threadId}
      ORDER BY created_at ASC
      LIMIT ${HISTORY_LIMIT}
    `) as HistoryRow[]
    const history: ChatTurn[] = historyRows.map((r) => ({ role: r.role, content: r.content }))

    type EntityCtxRow = {
      id: string
      name: string
      type: string
      year: number | null
      description: string | null
    }
    type RelCtxRow = { id: string; from_name: string; to_name: string; type: string; notes: string | null }
    type QuoteCtxRow = { id: string; entity_name: string; text: string; source: string | null }
    type TypeRow = { slug: string }

    // Three branches for context loading, depending on the thread:
    //   - focusEntity:  narrow to that entity + its direct neighbors + its citas
    //   - general chat: RAG (semantic top-K + recency) keyed off the user's
    //                   latest message → escala a 100k+ y trae lo topical
    //                   aunque sea antiguo.
    //   - (history-only call with no new message would skip both, but
    //     /api/chat/threads/:id/messages always POSTs a userText.)
    let entityRows: EntityCtxRow[]
    let relRows: RelCtxRow[]
    let quoteRows: QuoteCtxRow[]
    let entityTypeRows: TypeRow[]
    let relTypeRows: TypeRow[]
    let usedRag = false
    let usedHyde = false

    if (focusEntityId) {
      ;[entityRows, relRows, quoteRows, entityTypeRows, relTypeRows] = await Promise.all([
        sql`SELECT id, name, type, year, description
            FROM entities
            WHERE deleted_at IS NULL
              AND (id = ${focusEntityId}
                   OR id IN (
                     SELECT CASE WHEN from_id = ${focusEntityId} THEN to_id ELSE from_id END
                     FROM relationships
                     WHERE deleted_at IS NULL
                       AND (from_id = ${focusEntityId} OR to_id = ${focusEntityId})
                   ))` as unknown as Promise<EntityCtxRow[]>,
        sql`SELECT r.id, ef.name AS from_name, et.name AS to_name, r.type, r.notes
            FROM relationships r
            JOIN entities ef ON ef.id = r.from_id
            JOIN entities et ON et.id = r.to_id
            WHERE r.deleted_at IS NULL
              AND (r.from_id = ${focusEntityId} OR r.to_id = ${focusEntityId})
            ORDER BY r.created_at DESC` as unknown as Promise<RelCtxRow[]>,
        sql`SELECT q.id, e.name AS entity_name, q.text, q.source
            FROM quotes q
            JOIN entities e ON e.id = q.entity_id
            WHERE q.deleted_at IS NULL
              AND q.entity_id = ${focusEntityId}
            ORDER BY q.created_at DESC` as unknown as Promise<QuoteCtxRow[]>,
        sql`SELECT slug FROM entity_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
        sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
      ])
    } else {
      const [ragCtx, eTypes, rTypes] = await Promise.all([
        buildRagContext(
          sql as unknown as (
            strings: TemplateStringsArray,
            ...values: unknown[]
          ) => Promise<unknown>,
          userText,
          userId,
          {
            relationshipLimit: CONTEXT_RELATIONSHIP_LIMIT,
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
          },
        ),
        sql`SELECT slug FROM entity_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
        sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
      ])
      entityRows = ragCtx.entities
      relRows = ragCtx.relationships
      quoteRows = ragCtx.quotes
      entityTypeRows = eTypes
      relTypeRows = rTypes
      usedRag = ragCtx.usedRag
      usedHyde = ragCtx.usedHyde ?? false
    }

    const tramaContext: ChatTramaContext = {
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

    const entityTypes =
      entityTypeRows.length > 0 ? entityTypeRows.map((r) => r.slug) : FALLBACK_ENTITY_TYPES
    const relationshipTypes =
      relTypeRows.length > 0 ? relTypeRows.map((r) => r.slug) : FALLBACK_RELATIONSHIP_TYPES

    // If this is an entity-focused thread, look up the focus entity's name+type
    // so the prompt can address it explicitly ("conversación sobre Borges").
    const focusEntity = focusEntityId
      ? tramaContext.entities.find((e) => e.id === focusEntityId) ?? null
      : null
    const messages = buildChatPrompt(
      history,
      tramaContext,
      relationshipTypes,
      entityTypes,
      focusEntity ? { id: focusEntity.id, name: focusEntity.name, type: focusEntity.type } : null,
    )

    // Stream the assistant reply back as SSE. The client subscribes to the
    // event stream and renders partial text as it arrives. At the end we send
    // a 'done' frame with the persisted assistant message id and proposal.
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        function send(event: string, data: unknown) {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        // Tell the client about the user message id immediately so it can
        // reconcile the optimistic message.
        send('user', userMessage)

        let assembled = ''
        let usage = {
          provider: 'unknown',
          model: 'unknown',
          tokensIn: 0,
          tokensOut: 0,
          costCents: 0,
          durationMs: 0,
        }
        let llmError: string | null = null

        const chatOverride = {
          provider: invocation.provider,
          model: invocation.model,
        }

        try {
          for await (const frame of askLLMForTextStreaming(messages, chatOverride)) {
            if (frame.type === 'chunk') {
              assembled += frame.content
              send('chunk', { content: frame.content })
            } else if (frame.type === 'done') {
              assembled = frame.content || assembled
              usage = frame.usage
            } else if (frame.type === 'error') {
              llmError = frame.message
            }
          }
        } catch (err) {
          llmError = err instanceof Error ? err.message : String(err)
        }

        if (llmError) {
          send('error', { message: llmError })
          controller.close()
          return
        }

        const { prose, proposal } = parseChatReply(assembled)
        const proposalToStore = hasAnyProposal(proposal) ? proposal : null

        type AssistantInsertRow = { id: string; created_at: string }
        const assistantRows = (await sql`
          INSERT INTO chat_messages (
            thread_id, role, content, proposal, tokens_in, tokens_out, cost_cents, provider, model
          ) VALUES (
            ${threadId}, 'assistant', ${prose},
            ${proposalToStore ? JSON.stringify(proposalToStore) : null}::jsonb,
            ${usage.tokensIn}, ${usage.tokensOut}, ${usage.costCents},
            ${usage.provider}, ${usage.model}
          )
          RETURNING id, created_at
        `) as AssistantInsertRow[]

        await sql`UPDATE chat_threads SET updated_at = NOW() WHERE id = ${threadId}`

        // Best-effort thread title autogenneration on first exchange.
        if (!thread.title && historyRows.length <= 1) {
          try {
            const titleMessages = buildChatTitlePrompt(userText)
            const titleResp = await askLLMForText(titleMessages, chatOverride)
            const rawTitle = typeof titleResp.content === 'string' ? titleResp.content : ''
            const cleanTitle = rawTitle.trim().replace(/^["']|["']$/g, '').slice(0, 80)
            if (cleanTitle) {
              await sql`UPDATE chat_threads SET title = ${cleanTitle} WHERE id = ${threadId}`
            }
          } catch {
            // ignore
          }
        }

        logEvent({
          event: 'chat_message_completed',
          provider: usage.provider,
          model: usage.model,
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          costCents: usage.costCents,
          durationMs: usage.durationMs,
          hasProposal: !!proposalToStore,
          streaming: true,
          focused: !!focusEntityId,
          usedRag,
          usedHyde,
        })

        sql`
          INSERT INTO extraction_log (
            input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms
          ) VALUES (
            ${`chat:${threadId}`},
            ${JSON.stringify({ proposal: proposalToStore })}::jsonb,
            ${usage.provider},
            ${usage.model},
            ${usage.tokensIn},
            ${usage.tokensOut},
            ${usage.costCents},
            ${usage.durationMs}
          )
        `.catch(() => {})

        send('done', {
          assistantMessage: {
            id: assistantRows[0].id,
            role: 'assistant' as const,
            content: prose,
            proposal: proposalToStore,
            createdAt: assistantRows[0].created_at,
            provider: usage.provider,
            model: usage.model,
          },
        })
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  },
)

export const config: Config = {
  path: '/api/chat/threads/:threadId/messages',
}
