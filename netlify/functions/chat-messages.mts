import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { askLLMForTextStreaming } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { ChatMessageSendBody } from './_lib/chat-body-schemas.js'
import {
  buildChatPrompt,
  deriveThreadTitle,
  type ChatTurn,
} from './_lib/chat-prompt.js'
import {
  loadChatContextForFocus,
  loadChatContextWithRag,
} from './_lib/chat-context.js'
import { parseChatReply, hasAnyProposal } from './_lib/chat-validate.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { ensureUserRow } from './_lib/user-provisioning.js'

const HISTORY_LIMIT = 30
const CONTEXT_RELATIONSHIP_LIMIT = 150

type ChatMessageRow = {
  id: string
  role: 'user' | 'assistant'
  content: string
  proposal: unknown
  created_at: string
  provider: string | null
  model: string | null
}

type ChatThreadRow = {
  id: string
  title: string | null
  context: string | null
}

type UserInsertRow = {
  id: string
  created_at: string
}

type HistoryRow = {
  role: 'user' | 'assistant'
  content: string
}

type AssistantInsertRow = {
  id: string
  created_at: string
}

export default withObservability(
  'chat-messages',
  async (req: Request, context: Context, { requestId }) => {
    const threadId = context.params.threadId
    if (!threadId) return ApiErrors.validation(requestId, 'thread id required')

    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()

    if (req.method === 'GET') {
      const rows = await sqlTyped<ChatMessageRow>(sql`
        SELECT id, role, content, proposal, created_at, provider, model
        FROM chat_messages
        WHERE thread_id = ${threadId} AND user_id = ${userId}
        ORDER BY created_at ASC
        LIMIT 500
      `)
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

    await ensureUserRow(sql, authedUser)

    const budgetExceeded = await checkMonthlyBudget(userId, requestId)
    if (budgetExceeded) return budgetExceeded

    // Resolve AI mode upfront so we don't persist a user message that the
    // assistant can never answer (Off blocks the whole exchange).
    const invocation = await resolveAIInvocation(req, 'chat', userId)
    if (invocation.kind === 'off') return aiOffResponse(requestId)

    const threadRows = await sqlTyped<ChatThreadRow>(sql`
      SELECT id, title, context
      FROM chat_threads
      WHERE id = ${threadId} AND deleted_at IS NULL AND user_id = ${userId}
    `)
    const thread = threadRows[0]
    if (!thread) {
      return ApiErrors.notFound(requestId, 'Thread no encontrado')
    }

    // Entity-focused threads have context = "entity:<uuid>". When present we
    // narrow the trama context fed to the model to that one entity + its
    // direct neighbors, so the model can sustain a focused conversation
    // about "this person/book/etc." without drowning in unrelated rows.
    const entityFocusMatch = thread.context?.match(/^entity:([0-9a-f-]{36})$/i)
    const focusEntityId = entityFocusMatch?.[1] ?? null

    // Persist user message first so it survives an LLM failure.
    const userRows = await sqlTyped<UserInsertRow>(sql`
      INSERT INTO chat_messages (thread_id, role, content, user_id)
      VALUES (${threadId}, 'user', ${userText}, ${userId})
      RETURNING id, created_at
    `)
    const userRow = userRows[0]
    if (!userRow) {
      return ApiErrors.internal(requestId, 'No se pudo persistir el mensaje del usuario')
    }
    const userMessage = {
      id: userRow.id,
      role: 'user' as const,
      content: userText,
      createdAt: userRow.created_at,
      proposal: null,
    }

    // Gather context.
    const historyRows = await sqlTyped<HistoryRow>(sql`
      SELECT role, content
      FROM chat_messages
      WHERE thread_id = ${threadId} AND user_id = ${userId}
      ORDER BY created_at ASC
      LIMIT ${HISTORY_LIMIT}
    `)
    const history: ChatTurn[] = historyRows.map((r) => ({ role: r.role, content: r.content }))

    // Auto-título en el primer intercambio: la primera pregunta, recortada
    // tipográficamente. Va ANTES del stream — el rail muestra el título
    // apenas el hilo nace, y no depende de que el LLM responda.
    if (!thread.title && historyRows.length <= 1) {
      const autoTitle = deriveThreadTitle(userText)
      if (autoTitle) {
        await sql`UPDATE chat_threads SET title = ${autoTitle} WHERE id = ${threadId} AND user_id = ${userId}`
      }
    }

    // S4: la lógica de carga de contexto vive en `_lib/chat-context.ts`.
    // Dos branches según el thread:
    //   - focusEntity:  carga la entidad + vecinos directos + citas (local).
    //   - general chat: RAG (semantic top-K + recency + rerank LLM + HyDE).
    const { tramaContext, entityTypes, relationshipTypes, usedRag, usedHyde } =
      focusEntityId
        ? await loadChatContextForFocus(sql, focusEntityId, userId)
        : await loadChatContextWithRag(
            sql,
            userText,
	            userId,
	            { provider: invocation.provider, model: invocation.model },
	            CONTEXT_RELATIONSHIP_LIMIT,
	            requestId,
	          )

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
        // Si el reply salió del cache (providers no-streaming caen a callLLM,
        // que puede dar hit), no se gastaron tokens → no se re-cobra el
        // presupuesto. Simétrico al fix de extract.
        let fromCache = false

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
              fromCache = frame.fromCache
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

        const assistantRows = await sqlTyped<AssistantInsertRow>(sql`
          INSERT INTO chat_messages (
            thread_id, role, content, proposal, tokens_in, tokens_out, cost_cents, provider, model, user_id
          ) VALUES (
            ${threadId}, 'assistant', ${prose},
            ${proposalToStore ? JSON.stringify(proposalToStore) : null}::jsonb,
            ${usage.tokensIn}, ${usage.tokensOut}, ${usage.costCents},
            ${usage.provider}, ${usage.model}, ${userId}
          )
          RETURNING id, created_at
        `)
        const assistantRow = assistantRows[0]
        if (!assistantRow) {
          send('error', { message: 'No se pudo persistir la respuesta' })
          controller.close()
          return
        }

        await sql`UPDATE chat_threads SET updated_at = NOW() WHERE id = ${threadId} AND user_id = ${userId}`

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

        // extraction_log es el libro mayor del presupuesto (checkMonthlyBudget
        // suma su cost_cents). En el chat el costo se incurre SÍ o SÍ, así que
        // AWAIT el insert antes de cerrar el stream: antes era fire-and-forget y
        // si el cliente cortaba o el Lambda moría tras el stream, el gasto del
        // chat quedaba sin medir. El .catch mantiene el best-effort (un fallo de
        // log no debe romper la respuesta), pero ya no se pierde por no esperarlo.
        await sql`
          INSERT INTO extraction_log (
            input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id
          ) VALUES (
            ${`chat:${threadId}`},
            ${JSON.stringify({ proposal: proposalToStore })}::jsonb,
            ${usage.provider},
            ${usage.model},
            ${usage.tokensIn},
            ${usage.tokensOut},
            ${fromCache ? 0 : usage.costCents},
            ${usage.durationMs},
            ${userId}
          )
        `.catch(() => {})

        send('done', {
          assistantMessage: {
            id: assistantRow.id,
            role: 'assistant' as const,
            content: prose,
            proposal: proposalToStore,
            createdAt: assistantRow.created_at,
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
