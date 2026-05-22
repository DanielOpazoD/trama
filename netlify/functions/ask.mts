import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForJson } from './_lib/llm.js'
import { resolveTaskProvider } from './_lib/ai-tasks.js'
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
  }
  const userText = (body.text ?? '').trim()
  if (!userText) {
    return new Response('Falta el campo "text"', { status: 400 })
  }

  const view: ViewSlug =
    body.view && (VALID_VIEWS as string[]).includes(body.view)
      ? (body.view as ViewSlug)
      : null

  const budgetExceeded = await checkMonthlyBudget()
  if (budgetExceeded) return budgetExceeded

  const sql = getSql()

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
  }

  const messages = buildAskPrompt(userText, ctx)

  try {
    const taskCfg = await resolveTaskProvider('chat')
    const { content, usage, fromCache } = await askLLMForJson(messages, {
      provider: taskCfg.provider || undefined,
      model: taskCfg.model,
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

    return Response.json({
      reply,
      proposal: hasProposal ? cleanedProposal : null,
      provider: usage.provider,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(`Error llamando al LLM: ${message}`, { status: 502 })
  }
})

export const config: Config = {
  path: '/api/ask',
}
