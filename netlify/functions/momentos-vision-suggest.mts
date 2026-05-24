import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { getStore } from '@netlify/blobs'
import { askLLMForVision } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { withObservability } from './_lib/handler-wrap.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'

/**
 * POST /api/momentos/:id/vision-suggest
 *
 * Para fotos: pide a la IA con visión (Anthropic Claude o Gemini) que
 *   (a) genere un caption corto en español ("playa, atardecer, tres personas"),
 *   (b) identifique cuáles entidades existentes de tu trama aparecen en la
 *       foto (típicamente personas — Lola, tu hermana, etc.).
 *
 * Conservador: si la IA no reconoce a nadie con seguridad, devuelve
 * matchedIds vacío. Solo personas marcadas explícitamente en la trama
 * cuentan — no inventamos.
 *
 * Devuelve: { caption, matchedIds, provider, model }
 */
export default withObservability(
  'momentos-vision-suggest',
  async (req: Request, context: Context) => {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }
    const id = context.params.id
    if (!id) return new Response('id requerido', { status: 400 })

    const budgetExceeded = await checkMonthlyBudget()
    if (budgetExceeded) return budgetExceeded

    const sql = getSql()

    type Row = { kind: string; payload: Record<string, unknown> }
    const rows = (await sql`
      SELECT kind, payload FROM momentos
      WHERE id = ${id} AND deleted_at IS NULL
    `) as Row[]
    if (rows.length === 0) {
      return new Response('Momento no encontrado', { status: 404 })
    }
    const m = rows[0]
    if (m.kind !== 'foto') {
      return new Response('Solo aplica a kind=foto', { status: 400 })
    }
    const storageKey =
      typeof m.payload.storageKey === 'string' ? m.payload.storageKey : null
    if (!storageKey) {
      return new Response('storageKey faltante en payload', { status: 400 })
    }

    // Cargar el blob desde Netlify Blobs.
    const store = getStore('momentos-media')
    const blob = await store.getWithMetadata(storageKey, { type: 'arrayBuffer' })
    if (!blob) {
      return new Response('Imagen no encontrada en storage', { status: 404 })
    }
    const mime =
      typeof blob.metadata.mime === 'string' ? blob.metadata.mime : 'image/jpeg'
    // Base64 encode para pasarlo al LLM. arrayBuffer → bytes → base64.
    const bytes = new Uint8Array(blob.data)
    let binary = ''
    const chunkSize = 32768
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunkSize))
    }
    const imageBase64 = btoa(binary)

    // Existing entities — solo personas y lugares como candidatos (esos son
    // los típicos "visibles" en foto). Conceptos / libros / canciones no
    // aparecen en imágenes generalmente.
    const existing = (await sql`
      SELECT id, name, type
      FROM entities
      WHERE deleted_at IS NULL
        AND type IN ('persona', 'escritor', 'filosofo', 'musico', 'banda',
                     'director', 'artista', 'cientifico', 'lugar')
      ORDER BY created_at DESC
      LIMIT 200
    `) as Array<{ id: string; name: string; type: string }>

    const invocation = await resolveAIInvocation(req, 'reflect')
    if (invocation.kind === 'off') return aiOffResponse()

    const peopleList =
      existing.length > 0
        ? existing.map((e) => `${e.id} | ${e.name} | ${e.type}`).join('\n')
        : '(ninguna persona registrada todavía)'

    const system = `Eres un asistente que ayuda al usuario a anclar fotos en su mapa cognitivo.

Te paso UNA imagen + la lista de personas y lugares que el usuario ya tiene registrados. Tu trabajo:

1. Generar un caption breve en español (máx 12 palabras), descriptivo y neutro. Sin interpretaciones poéticas. Ejemplo: "atardecer en la playa, tres personas caminando".
2. Identificar SI alguna de las entidades existentes aparece en la imagen. Sé EXTREMADAMENTE conservador — solo si reconoces sin duda alguna (porque sería raro que reconozcas caras de gente real). Si dudas: array vacío.

Personas/lugares registrados (id | nombre | tipo):
${peopleList}

DEVUELVE EXCLUSIVAMENTE este JSON, sin markdown:

{
  "caption": "string corto en español",
  "matchedIds": ["uuid-1"]
}`

    try {
      const { content, usage, fromCache } = await askLLMForVision(
        system,
        'Describe la imagen y matchea con entidades si corresponde.',
        imageBase64,
        mime,
        { provider: invocation.provider, model: invocation.model },
      )

      let caption = ''
      let matchedIds: string[] = []
      if (content && typeof content === 'object') {
        const obj = content as Record<string, unknown>
        if (typeof obj.caption === 'string') caption = obj.caption.trim()
        if (Array.isArray(obj.matchedIds)) {
          const validIds = new Set(existing.map((e) => e.id))
          matchedIds = obj.matchedIds
            .filter((x): x is string => typeof x === 'string')
            .filter((mid) => validIds.has(mid))
        }
      }

      logEvent({
        event: 'momento_vision_suggest',
        momentoId: id,
        provider: usage.provider,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costCents: usage.costCents,
        durationMs: usage.durationMs,
        fromCache,
        captionLen: caption.length,
        matchCount: matchedIds.length,
      })

      return Response.json({
        caption: caption || null,
        matchedIds,
        provider: usage.provider,
        model: usage.model,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return new Response(`Error llamando al LLM: ${msg}`, { status: 502 })
    }
  },
)

export const config: Config = {
  path: '/api/momentos/:id/vision-suggest',
}
