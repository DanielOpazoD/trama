import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { askLLMForVision } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { buildImageExtractionPrompt } from './_lib/extract-image-prompt.js'
import { validateExtraction } from './_lib/extract-validate.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { ExtractFromImageBody } from './_lib/admin-schemas.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { getAuthedUser } from './_lib/auth.js'
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

// 8 MB cap on the incoming image, after base64 decoding. Spotify covers /
// page photos are usually < 2 MB; this leaves slack without letting a stray
// 20 MB upload eat the function budget.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export default withObservability(
  'extract-from-image',
  async (req, _ctx, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }

    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    await ensureUserRow(sql, authedUser)

    const budgetExceeded = await checkMonthlyBudget(userId, requestId)
    if (budgetExceeded) return budgetExceeded

    const parsed = await parseJsonBody(req, ExtractFromImageBody, requestId)
    if (!parsed.ok) return parsed.response
    const imageBase64 = parsed.data.imageBase64.trim()
    const mimeType = parsed.data.mimeType.trim()

    if (!ALLOWED_MIMES.has(mimeType)) {
      return ApiErrors.unsupportedMediaType(
        requestId,
        `mimeType "${mimeType}" no soportado. Usa image/jpeg, image/png, image/webp o image/gif.`,
      )
    }
    // Quick sanity-check on size — base64 inflates by ~4/3, so we accept up
    // to (MAX * 4 / 3) chars before the binary would exceed the limit.
    if (imageBase64.length > (MAX_IMAGE_BYTES * 4) / 3) {
      return ApiErrors.payloadTooLarge(
        requestId,
        'La imagen excede el máximo permitido (8 MB).',
      )
    }

    type TypeRow = { slug: string }
    const [entityTypeRows, relTypeRows] = await Promise.all([
      sqlTyped<TypeRow>(sql`SELECT slug FROM entity_types ORDER BY sort_order, slug`),
      sqlTyped<TypeRow>(
        sql`SELECT slug FROM relationship_types ORDER BY sort_order, slug`,
      ),
    ])

    const entityTypes =
      entityTypeRows.length > 0
        ? entityTypeRows.map((r) => r.slug)
        : FALLBACK_ENTITY_TYPES
    const relationshipTypes =
      relTypeRows.length > 0
        ? relTypeRows.map((r) => r.slug)
        : FALLBACK_RELATIONSHIP_TYPES

    const { system, user } = buildImageExtractionPrompt(entityTypes, relationshipTypes)

    const invocation = await resolveAIInvocation(req, 'extract-image', userId)
    if (invocation.kind === 'off') return aiOffResponse(requestId)

    try {
      const { content, usage, fromCache } = await askLLMForVision(
        system,
        user,
        imageBase64,
        mimeType,
        { provider: invocation.provider, model: invocation.model },
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
        input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id
      ) VALUES (
        ${`image:${mimeType}`},
        ${JSON.stringify(cleaned)}::jsonb,
        ${usage.provider},
        ${usage.model},
        ${usage.tokensIn},
        ${usage.tokensOut},
        ${usage.costCents},
        ${usage.durationMs},
        ${userId}
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
      INSERT INTO extraction_log (input_text, proposal, provider, model, error, user_id)
      VALUES (${`image:${mimeType}`}, '{}'::jsonb, ${'unknown'}, ${'unknown'}, ${message}, ${userId})
    `.catch(() => {})
      return ApiErrors.upstream(requestId, `Error llamando al LLM de visión: ${message}`)
    }
  },
)

export const config: Config = {
  path: '/api/extract-from-image',
}
