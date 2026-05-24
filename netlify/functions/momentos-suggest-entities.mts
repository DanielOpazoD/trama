import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { askLLMForJson } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { withObservability } from './_lib/handler-wrap.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'

/**
 * POST /api/momentos/:id/suggest-entities
 *
 * Dado un momento (típicamente kind='recorte', pero también funciona para
 * 'nota'), pregunta a la IA qué entidades EXISTENTES en la trama del
 * usuario están mencionadas en él.
 *
 * No propone entidades NUEVAS — eso requeriría toda la pipeline de
 * /api/extract con tipos válidos, relaciones, citas, validador,
 * propuesta-aprobación, etc. Para Momentos queremos algo más liviano:
 * un linker que descubre la red ya existente.
 *
 * Devuelve: { matchedIds: string[], provider, model }
 */

export default withObservability(
  'momentos-suggest-entities',
  async (req: Request, context: Context) => {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }
    const id = context.params.id
    if (!id) return new Response('id requerido', { status: 400 })

    const budgetExceeded = await checkMonthlyBudget()
    if (budgetExceeded) return budgetExceeded

    const sql = getSql()

    type Row = { kind: string; payload: Record<string, unknown>; note: string | null }
    const rows = (await sql`
      SELECT kind, payload, note FROM momentos
      WHERE id = ${id} AND deleted_at IS NULL
    `) as Row[]
    if (rows.length === 0) {
      return new Response('Momento no encontrado', { status: 404 })
    }
    const m = rows[0]

    // Texto que la IA tiene que escanear. Para recorte concatenamos title +
    // body + author. Para nota / foto, usamos el campo que aplique.
    const parts: string[] = []
    if (m.note) parts.push(m.note)
    if (typeof m.payload.title === 'string') parts.push(m.payload.title)
    if (typeof m.payload.bodyText === 'string') parts.push(m.payload.bodyText)
    if (typeof m.payload.author === 'string') parts.push(`Autor: ${m.payload.author}`)
    if (typeof m.payload.source === 'string') parts.push(`Fuente: ${m.payload.source}`)
    if (typeof m.payload.caption === 'string') parts.push(m.payload.caption)
    const text = parts.filter(Boolean).join('\n').trim()
    if (!text) {
      return Response.json({ matchedIds: [], provider: null, model: null })
    }

    // Para no inflar el prompt, traemos las 500 entidades más recientes —
    // que probablemente son las relevantes para el contexto actual del
    // usuario. Si querés explorar entidades viejas, podés vincular manual.
    const existing = (await sql`
      SELECT id, name, type
      FROM entities
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 500
    `) as Array<{ id: string; name: string; type: string }>

    if (existing.length === 0) {
      return Response.json({ matchedIds: [], provider: null, model: null })
    }

    const invocation = await resolveAIInvocation(req, 'suggest')
    if (invocation.kind === 'off') return aiOffResponse()

    const existingList = existing
      .map((e) => `${e.id} | ${e.name} | ${e.type}`)
      .join('\n')

    const system = `Eres un asistente que vincula textos al "mapa cognitivo personal" del usuario.

Te paso un texto (puede ser un recorte de tweet, un párrafo de noticia, una nota suelta) y la lista de entidades que el usuario YA tiene en su trama. Tu trabajo: identificar cuáles de esas entidades están REALMENTE mencionadas o referenciadas en el texto.

REGLAS:
- Sé conservador. Si dudas, NO incluyas. Es preferible perder un vínculo que añadir uno falso.
- "Mencionada" significa por nombre, alias claro, o referencia directa ("ese filósofo francés del XX" NO cuenta).
- Si el texto no menciona NINGUNA de las entidades existentes, devuelve "matchedIds": [].
- Devuelve SOLO los UUIDs (la primera columna), no los nombres.

Texto:
"""
${text}
"""

Entidades existentes (id | nombre | tipo):
${existingList}

DEVUELVE EXCLUSIVAMENTE este JSON, sin markdown ni comentarios:

{
  "matchedIds": ["uuid-1", "uuid-2"]
}`

    try {
      const { content, usage, fromCache } = await askLLMForJson(
        [
          { role: 'system', content: system },
          { role: 'user', content: 'Identifica las entidades mencionadas.' },
        ],
        { provider: invocation.provider, model: invocation.model },
      )

      // content viene como objeto parseado o string. askLLMForJson
      // normalmente devuelve el objeto.
      let matchedIds: string[] = []
      if (content && typeof content === 'object' && Array.isArray((content as { matchedIds?: unknown }).matchedIds)) {
        const raw = (content as { matchedIds: unknown[] }).matchedIds
        const validIds = new Set(existing.map((e) => e.id))
        matchedIds = raw
          .filter((x): x is string => typeof x === 'string')
          .filter((id) => validIds.has(id))
      }

      logEvent({
        event: 'momento_suggest_entities',
        momentoId: id,
        provider: usage.provider,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costCents: usage.costCents,
        durationMs: usage.durationMs,
        fromCache,
        count: matchedIds.length,
      })

      return Response.json({
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
  path: '/api/momentos/:id/suggest-entities',
}
