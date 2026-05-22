import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForVision } from './_lib/llm.js'
import { resolveTaskProvider } from './_lib/ai-tasks.js'
import { buildImageExtractionPrompt } from './_lib/extract-image-prompt.js'
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

// 8 MB cap on the incoming image, after base64 decoding. Spotify covers /
// page photos are usually < 2 MB; this leaves slack without letting a stray
// 20 MB upload eat the function budget.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export default withObservability('extract-from-image', async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const budgetExceeded = await checkMonthlyBudget()
  if (budgetExceeded) return budgetExceeded

  const body = (await req.json().catch(() => ({}))) as {
    imageBase64?: string
    mimeType?: string
  }
  const imageBase64 = (body.imageBase64 ?? '').trim()
  const mimeType = (body.mimeType ?? '').trim()

  if (!imageBase64) {
    return new Response('Falta el campo "imageBase64"', { status: 400 })
  }
  if (!ALLOWED_MIMES.has(mimeType)) {
    return new Response(
      `mimeType "${mimeType}" no soportado. Usa image/jpeg, image/png, image/webp o image/gif.`,
      { status: 400 },
    )
  }
  // Quick sanity-check on size — base64 inflates by ~4/3, so we accept up
  // to (MAX * 4 / 3) chars before the binary would exceed the limit.
  if (imageBase64.length > (MAX_IMAGE_BYTES * 4) / 3) {
    return new Response('La imagen excede el máximo permitido (8 MB).', { status: 413 })
  }

  const sql = getSql()

  type TypeRow = { slug: string }
  const [entityTypeRows, relTypeRows] = await Promise.all([
    sql`SELECT slug FROM entity_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
    sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug` as unknown as Promise<TypeRow[]>,
  ])

  const entityTypes =
    entityTypeRows.length > 0 ? entityTypeRows.map((r) => r.slug) : FALLBACK_ENTITY_TYPES
  const relationshipTypes =
    relTypeRows.length > 0 ? relTypeRows.map((r) => r.slug) : FALLBACK_RELATIONSHIP_TYPES

  const { system, user } = buildImageExtractionPrompt(entityTypes, relationshipTypes)

  try {
    const taskCfg = await resolveTaskProvider('extract-image')
    const { content, usage, fromCache } = await askLLMForVision(
      system,
      user,
      imageBase64,
      mimeType,
      { provider: taskCfg.provider || undefined, model: taskCfg.model },
    )
    const cleaned = validateExtraction(
      content,
      [],
      new Set(entityTypes),
      new Set(relationshipTypes),
    )

    logEvent({
      event: 'extract_from_image_completed',
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
        ${`image:${mimeType}`},
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
      VALUES (${`image:${mimeType}`}, '{}'::jsonb, ${'unknown'}, ${'unknown'}, ${message})
    `.catch(() => {})
    return new Response(`Error llamando al LLM de visión: ${message}`, { status: 502 })
  }
})

export const config: Config = {
  path: '/api/extract-from-image',
}
