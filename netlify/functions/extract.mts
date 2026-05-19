import { neon } from '@neondatabase/serverless'
import type { Config, Context } from '@netlify/functions'
import { askLLMForJson } from './_lib/llm.js'
import { buildExtractionPrompt } from './_lib/extract-prompt.js'
import { validateExtraction } from './_lib/extract-validate.js'
import { withObservability } from './_lib/handler-wrap.js'
import { logEvent } from './_lib/observability.js'
import { rateLimit } from './_lib/rate-limit.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'

// Fallback types if the type tables are not yet populated (first deploy, etc).
const FALLBACK_ENTITY_TYPES = [
  'persona', 'libro', 'cancion', 'album', 'pelicula', 'obra', 'concepto', 'idea',
]
const FALLBACK_RELATIONSHIP_TYPES = [
  'influye_en', 'cita_a', 'responde_a', 'me_llego_por',
  'suena_como', 'inspira', 'contradice', 'asociado_con',
]

export default withObservability('extract', async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Rate limit: 30 extraction calls per IP per hour. Generous for personal use,
  // protective against runaway scripts.
  const rateLimited = rateLimit(req, { max: 30, windowMs: 60 * 60 * 1000 })
  if (rateLimited) return rateLimited

  // Monthly cost cap before incurring LLM cost.
  const budgetExceeded = await checkMonthlyBudget()
  if (budgetExceeded) return budgetExceeded

  let body: { text?: string }
  try {
    body = (await req.json()) as { text?: string }
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const text = (body.text ?? '').trim()
  if (!text) {
    return new Response('Falta el campo "text"', { status: 400 })
  }

  const connectionString = Netlify.env.get('NETLIFY_DATABASE_URL')
  if (!connectionString) {
    return new Response('NETLIFY_DATABASE_URL no está configurada', { status: 500 })
  }
  const sql = neon(connectionString)

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

  try {
    const { content, usage, fromCache } = await askLLMForJson(messages)
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

    return Response.json(cleaned)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sql`
      INSERT INTO extraction_log (input_text, proposal, provider, model, error)
      VALUES (${text}, '{}'::jsonb, ${'unknown'}, ${'unknown'}, ${message})
    `.catch(() => {})
    return new Response(`Error llamando al LLM: ${message}`, { status: 502 })
  }
})

export const config: Config = {
  path: '/api/extract',
}
