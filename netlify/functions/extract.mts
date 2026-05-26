import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForJson } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { buildExtractionPrompt } from './_lib/extract-prompt.js'
import { validateExtraction } from './_lib/extract-validate.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'

// Fallback types if the type tables are not yet populated (first deploy, etc).
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

export default withObservability('extract', async (req: Request, _context: Context, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  // Monthly cost cap before incurring LLM cost.
  const budgetExceeded = await checkMonthlyBudget()
  if (budgetExceeded) return budgetExceeded

  let body: { text?: string }
  try {
    body = (await req.json()) as { text?: string }
  } catch {
    return ApiErrors.validation(requestId, 'Invalid JSON')
  }

  const text = (body.text ?? '').trim()
  if (!text) {
    return ApiErrors.validation(requestId, 'Falta el campo "text"')
  }

  const sql = getSql()

  // Fetch context: valid type slugs and existing entities.
  const [entityTypeRows, relTypeRows, existing] = await Promise.all([
    sql`SELECT slug FROM entity_types ORDER BY sort_order, slug` as unknown as Promise<Array<{ slug: string }>>,
    sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug` as unknown as Promise<Array<{ slug: string }>>,
    sql`SELECT id, name, type FROM entities WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 500` as unknown as Promise<Array<{ id: string; name: string; type: string }>>,
  ])

  const entityTypes = entityTypeRows.length > 0
    ? entityTypeRows.map((r) => r.slug)
    : FALLBACK_ENTITY_TYPES
  const relationshipTypes = relTypeRows.length > 0
    ? relTypeRows.map((r) => r.slug)
    : FALLBACK_RELATIONSHIP_TYPES

  const messages = buildExtractionPrompt(text, existing, entityTypes, relationshipTypes)

  const invocation = await resolveAIInvocation(req, 'extract')
  if (invocation.kind === 'off') return aiOffResponse()

  try {
    const { content, usage, fromCache } = await askLLMForJson(messages, {
      provider: invocation.provider,
      model: invocation.model,
    })
    const cleaned = validateExtraction(
      content,
      existing,
      new Set(entityTypes),
      new Set(relationshipTypes),
    )

    logEvent({
      event: 'extraction_completed',
      provider: usage.provider,
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costCents: usage.costCents,
      durationMs: usage.durationMs,
      fromCache,
      proposedEntities: cleaned.entities.length,
      proposedRelationships: cleaned.relationships.length,
      proposedQuotes: cleaned.quotes.length,
    })

    sql`
      INSERT INTO extraction_log (
        input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms
      ) VALUES (
        ${text},
        ${JSON.stringify(cleaned)}::jsonb,
        ${usage.provider},
        ${usage.model},
        ${usage.tokensIn},
        ${usage.tokensOut},
        ${usage.costCents},
        ${usage.durationMs}
      )
    `.catch(() => {})

    return Response.json({
      ...cleaned,
      provider: usage.provider,
      model: usage.model,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sql`
      INSERT INTO extraction_log (input_text, proposal, provider, model, error)
      VALUES (${text}, '{}'::jsonb, ${'unknown'}, ${'unknown'}, ${message})
    `.catch(() => {})
    return ApiErrors.upstream(requestId, `Error llamando al LLM: ${message}`)
  }
})

export const config: Config = {
  path: '/api/extract',
}
