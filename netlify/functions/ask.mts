import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForJson } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { buildAskPrompt, type AskContext } from './_lib/ask-prompt.js'
import { validateExtraction } from './_lib/extract-validate.js'
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

const CONTEXT_ENTITY_LIMIT = 80
const CONTEXT_REL_LIMIT = 100
const CONTEXT_QUOTE_LIMIT = 20

type ViewSlug = AskContext['view']
const VALID_VIEWS: ViewSlug[] = [
  'grafo', 'entidades', 'citas', 'relaciones', 'escuchas', 'chat', 'sugerencias',
]

export default withObservability('ask', async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    text?: string
    view?: string
    selectedEntityId?: string
    threadId?: string
  }
  const userText = (body.text ?? '').trim()
  if (!userText) {
    return new Response('Falta el campo "text"', { status: 400 })
  }

  const view: ViewSlug =
    body.view && (VALID_VIEWS as string[]).includes(body.view)
      ? (body.view as ViewSlug)
      : null

  const incomingThreadId =
    typeof body.threadId === 'string' && body.threadId.length > 0 ? body.threadId : null

  const budgetExceeded = await checkMonthlyBudget()
  if (budgetExceeded) return budgetExceeded

  const sql = getSql()

  // Conversational history for this section thread, if any. Reused last N=10
  // turns (5 user + 5 assistant on average). Older turns drop off the prompt
  // but stay in the DB for the user to scroll through in ChatView.
  type HistoryRow = { role: 'user' | 'assistant'; content: string }
  let history: HistoryRow[] = []
  if (incomingThreadId) {
    const rows = (await sql`
      SELECT role, content
      FROM chat_messages
      WHERE thread_id = ${incomingThreadId}
      ORDER BY created_at DESC
      LIMIT 10
    `) as HistoryRow[]
    history = rows.slice().reverse()
  }

  type EntityCtxRow = {
    id: string
    name: string
    type: string
    year: number | null
    description: string | null
  }
  type RelCtxRow = { id: string; from_name: string; to_name: string; type: string }
  type QuoteCtxRow = { id: string; entity_name: string; text: string; source: string | null }
  type TypeRow = { slug: string }

  const [entityRows, relRows, quoteRows, entityTypeRows, relTypeRows, selectedRows] =
    await Promise.all([
      sql`SELECT id, name, type, year, description
          FROM entities
          WHERE deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT ${CONTEXT_ENTITY_LIMIT}` as unknown as Promise<EntityCtxRow[]>,
      sql`SELECT r.id, ef.name AS from_name, et.name AS to_name, r.type
          FROM relationships r
          JOIN entities ef ON ef.id = r.from_id
          JOIN entities et ON et.id = r.to_id
          WHERE r.deleted_at IS NULL
          ORDER BY r.created_at DESC
          LIMIT ${CONTEXT_REL_LIMIT}` as unknown as Promise<RelCtxRow[]>,
      sql`SELECT q.id, e.name AS entity_name, q.text, q.source
          FROM quotes q
          JOIN entities e ON e.id = q.entity_id
          WHERE q.deleted_at IS NULL
          ORDER BY q.created_at DESC
          LIMIT ${CONTEXT_QUOTE_LIMIT}` as unknown as Promise<QuoteCtxRow[]>,
      sql`SELECT slug FROM entity_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
      sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
      body.selectedEntityId
        ? (sql`SELECT id, name, type, description FROM entities
                WHERE id = ${body.selectedEntityId} AND deleted_at IS NULL` as unknown as Promise<
            Array<{ id: string; name: string; type: string; description: string | null }>
          >)
        : Promise.resolve([] as Array<{ id: string; name: string; type: string; description: string | null }>),
    ])

  const entityTypes =
    entityTypeRows.length > 0 ? entityTypeRows.map((r) => r.slug) : FALLBACK_ENTITY_TYPES
  const relationshipTypes =
    relTypeRows.length > 0 ? relTypeRows.map((r) => r.slug) : FALLBACK_RELATIONSHIP_TYPES

  const ctx: AskContext = {
    view,
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
    })),
    recentQuotes: quoteRows.map((q) => ({
      id: q.id,
      entityName: q.entity_name,
      text: q.text,
      source: q.source,
    })),
    entityTypes,
    relationshipTypes,
    selectedEntity:
      selectedRows.length > 0
        ? {
            id: selectedRows[0].id,
            name: selectedRows[0].name,
            type: selectedRows[0].type,
            description: selectedRows[0].description,
          }
        : null,
    history,
  }

  const messages = buildAskPrompt(userText, ctx)

  const invocation = await resolveAIInvocation(req, 'chat')
  if (invocation.kind === 'off') return aiOffResponse()

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
      entities: new Map(
        ctx.entities.map((e) => [e.id, { name: e.name, type: e.type }]),
      ),
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
    })

    sql`
      INSERT INTO extraction_log (
        input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms
      ) VALUES (
        ${`ask:${view ?? 'none'}`},
        ${JSON.stringify({ reply, proposal: cleanedProposal })}::jsonb,
        ${usage.provider},
        ${usage.model},
        ${usage.tokensIn},
        ${usage.tokensOut},
        ${usage.costCents},
        ${usage.durationMs}
      )
    `.catch(() => {})

    // Persist the turn to chat_messages so the AskBar has memory across
    // submissions. If the client didn't send a threadId yet we create one
    // tagged with the current view as its context.
    let activeThreadId: string | null = incomingThreadId
    if (!activeThreadId && view) {
      type TIdRow = { id: string }
      const created = (await sql`
        INSERT INTO chat_threads (context) VALUES (${view}) RETURNING id
      `) as TIdRow[]
      activeThreadId = created[0]?.id ?? null
    }

    if (activeThreadId) {
      // Insert user message first, then assistant. We do them serially so
      // their created_at order matches the conversation order. Best-effort:
      // a failure here shouldn't break the response the user already sees.
      const proposalToStore = hasProposal ? cleanedProposal : null
      await sql`
        INSERT INTO chat_messages (thread_id, role, content)
        VALUES (${activeThreadId}, 'user', ${userText})
      `.catch(() => {})
      await sql`
        INSERT INTO chat_messages (
          thread_id, role, content, proposal,
          tokens_in, tokens_out, cost_cents, provider, model
        ) VALUES (
          ${activeThreadId},
          'assistant',
          ${reply},
          ${proposalToStore ? JSON.stringify(proposalToStore) : null}::jsonb,
          ${usage.tokensIn},
          ${usage.tokensOut},
          ${usage.costCents},
          ${usage.provider},
          ${usage.model}
        )
      `.catch(() => {})
      // Bump the thread so it sorts to the top of the rail.
      await sql`UPDATE chat_threads SET updated_at = NOW() WHERE id = ${activeThreadId}`.catch(() => {})
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
    return new Response(`Error llamando al LLM: ${message}`, { status: 502 })
  }
})

export const config: Config = {
  path: '/api/ask',
}
