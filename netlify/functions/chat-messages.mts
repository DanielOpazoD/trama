import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForText } from './_lib/llm.js'
import {
  buildChatPrompt,
  buildChatTitlePrompt,
  type ChatTramaContext,
  type ChatTurn,
} from './_lib/chat-prompt.js'
import { parseChatReply, hasAnyProposal } from './_lib/chat-validate.js'
import { withObservability } from './_lib/handler-wrap.js'
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
  async (req: Request, context: Context) => {
    const threadId = context.params.threadId
    if (!threadId) return new Response('thread id required', { status: 400 })

    const sql = getSql()

    if (req.method === 'GET') {
      type Row = {
        id: string
        role: 'user' | 'assistant'
        content: string
        proposal: unknown
        created_at: string
      }
      const rows = (await sql`
        SELECT id, role, content, proposal, created_at
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
        })),
      )
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const body = (await req.json().catch(() => ({}))) as { content?: string }
    const userText = (body.content ?? '').trim()
    if (!userText) {
      return new Response('Falta el campo "content"', { status: 400 })
    }

    const budgetExceeded = await checkMonthlyBudget()
    if (budgetExceeded) return budgetExceeded

    // Ensure thread exists (would otherwise FK-violate when we insert).
    const threadRows = (await sql`
      SELECT id, title FROM chat_threads WHERE id = ${threadId} AND deleted_at IS NULL
    `) as Array<{ id: string; title: string | null }>
    if (threadRows.length === 0) {
      return new Response('Thread no encontrado', { status: 404 })
    }
    const thread = threadRows[0]

    // Persist user message first so it survives even if the LLM call fails.
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

    // Build context: prior history + trama snapshot.
    type HistoryRow = { role: 'user' | 'assistant'; content: string; created_at: string }
    const historyRows = (await sql`
      SELECT role, content, created_at
      FROM chat_messages
      WHERE thread_id = ${threadId}
      ORDER BY created_at ASC
      LIMIT ${HISTORY_LIMIT}
    `) as HistoryRow[]
    const history: ChatTurn[] = historyRows.map((r) => ({
      role: r.role,
      content: r.content,
    }))

    type EntityCtxRow = {
      id: string
      name: string
      type: string
      year: number | null
      description: string | null
    }
    type RelCtxRow = {
      from_name: string
      to_name: string
      type: string
      notes: string | null
    }
    type QuoteCtxRow = {
      entity_name: string
      text: string
      source: string | null
    }
    type TypeRow = { slug: string }

    const [entityRows, relRows, quoteRows, entityTypeRows, relTypeRows] = await Promise.all([
      sql`SELECT id, name, type, year, description
          FROM entities
          WHERE deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${CONTEXT_ENTITY_LIMIT}` as unknown as Promise<EntityCtxRow[]>,
      sql`SELECT ef.name AS from_name, et.name AS to_name, r.type, r.notes
          FROM relationships r
          JOIN entities ef ON ef.id = r.from_id
          JOIN entities et ON et.id = r.to_id
          WHERE r.deleted_at IS NULL
          ORDER BY r.created_at DESC
          LIMIT ${CONTEXT_RELATIONSHIP_LIMIT}` as unknown as Promise<RelCtxRow[]>,
      sql`SELECT e.name AS entity_name, q.text, q.source
          FROM quotes q
          JOIN entities e ON e.id = q.entity_id
          WHERE q.deleted_at IS NULL
          ORDER BY q.created_at DESC
          LIMIT ${CONTEXT_QUOTE_LIMIT}` as unknown as Promise<QuoteCtxRow[]>,
      sql`SELECT slug FROM entity_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
      sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
    ])

    const tramaContext: ChatTramaContext = {
      entities: entityRows.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        year: e.year,
        description: e.description,
      })),
      relationships: relRows.map((r) => ({
        fromName: r.from_name,
        toName: r.to_name,
        type: r.type,
        notes: r.notes,
      })),
      quotes: quoteRows.map((q) => ({
        entityName: q.entity_name,
        text: q.text,
        source: q.source,
      })),
    }

    const entityTypes =
      entityTypeRows.length > 0 ? entityTypeRows.map((r) => r.slug) : FALLBACK_ENTITY_TYPES
    const relationshipTypes =
      relTypeRows.length > 0 ? relTypeRows.map((r) => r.slug) : FALLBACK_RELATIONSHIP_TYPES

    const messages = buildChatPrompt(history, tramaContext, relationshipTypes, entityTypes)

    let replyText: string
    let usage = {
      provider: 'unknown',
      model: 'unknown',
      tokensIn: 0,
      tokensOut: 0,
      costCents: 0,
      durationMs: 0,
    }
    try {
      const llm = await askLLMForText(messages)
      replyText = typeof llm.content === 'string' ? llm.content : String(llm.content)
      usage = llm.usage
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return Response.json(
        {
          userMessage,
          error: `Error llamando al LLM: ${message}`,
        },
        { status: 502 },
      )
    }

    const { prose, proposal } = parseChatReply(replyText)
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

    // Bump thread updated_at so it sorts to the top in the sidebar.
    await sql`UPDATE chat_threads SET updated_at = NOW() WHERE id = ${threadId}`

    // Auto-generate a thread title on first exchange if it's still null.
    if (!thread.title && historyRows.length <= 1) {
      try {
        const titleMessages = buildChatTitlePrompt(userText)
        const titleResp = await askLLMForText(titleMessages)
        const rawTitle = typeof titleResp.content === 'string' ? titleResp.content : ''
        const cleanTitle = rawTitle.trim().replace(/^["']|["']$/g, '').slice(0, 80)
        if (cleanTitle) {
          await sql`UPDATE chat_threads SET title = ${cleanTitle} WHERE id = ${threadId}`
        }
      } catch {
        // Title generation is best-effort. A missing title shows as "(sin título)".
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

    return Response.json({
      userMessage,
      assistantMessage: {
        id: assistantRows[0].id,
        role: 'assistant' as const,
        content: prose,
        proposal: proposalToStore,
        createdAt: assistantRows[0].created_at,
      },
    })
  },
)

export const config: Config = {
  path: '/api/chat/threads/:threadId/messages',
}
