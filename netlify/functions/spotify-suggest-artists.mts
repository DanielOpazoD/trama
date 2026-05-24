import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { askLLMForJson } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import {
  aggregateTopGenres,
  fetchTopArtists,
  getValidAccessToken,
} from './_lib/spotify.js'

/**
 * POST /api/spotify/suggest-artists
 *
 * π5: dado el perfil musical del usuario (top artistas + géneros derivados),
 * pide al LLM 5-10 sugerencias de artistas afines que NO estén ya en su
 * trama Y que NO estén en sus top artistas (es decir, descubrimientos).
 *
 * Devuelve propuestas de tipo "ExtractionProposal-lite" — el frontend
 * las muestra como chips y al aceptar las añade a la trama con su
 * descripción + Spotify search url.
 *
 * Por qué LLM y no Spotify recommendations API: la API de Spotify
 * /recommendations devuelve tracks, no artistas. Y el género/contexto
 * "tu tipo de oyente" se aprovecha mejor con un modelo. Cost: ~1 call
 * de ~1000 tokens.
 */

export default withObservability('spotify-suggest-artists', async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const budgetExceeded = await checkMonthlyBudget()
  if (budgetExceeded) return budgetExceeded

  const sql = getSql()
  const accessToken = await getValidAccessToken(sql)
  if (!accessToken) {
    return new Response('Spotify no está conectado', { status: 400 })
  }

  // Pegar Spotify: top artists (long_term para sesgo a estable, no fad
  // de la semana). Genre aggregation con el mismo helper de κ-spotify.
  let topArtists: Awaited<ReturnType<typeof fetchTopArtists>> = []
  try {
    topArtists = await fetchTopArtists(accessToken, 'long_term')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Spotify API error'
    return new Response(msg, { status: 502 })
  }

  if (topArtists.length === 0) {
    return Response.json({
      suggestions: [],
      provider: null,
      model: null,
      reason: 'Sin top artistas en Spotify — escucha algo primero.',
    })
  }

  const topGenres = aggregateTopGenres(topArtists, 8)
  const topArtistNames = topArtists.slice(0, 20).map((a) => a.name)

  // Las entidades que YA están en la trama del usuario. Le pedimos al LLM
  // que excluya nombres ya presentes (no queremos proponer artistas que
  // el usuario ya tiene).
  const existingArtists = (await sql`
    SELECT name FROM entities
    WHERE deleted_at IS NULL
      AND type IN ('musico', 'banda', 'artista')
  `) as Array<{ name: string }>
  const existingNames = existingArtists.map((e) => e.name.toLowerCase())

  const invocation = await resolveAIInvocation(req, 'suggest')
  if (invocation.kind === 'off') return aiOffResponse()

  const excludeList = [
    ...new Set([...topArtistNames.map((n) => n.toLowerCase()), ...existingNames]),
  ]

  const system = `Eres un curador musical recomendando al usuario artistas que NO conoce todavía pero que probablemente le gustarán, basándote en su perfil.

Perfil del usuario:
- Géneros con más peso: ${topGenres.map((g) => g.name).slice(0, 6).join(', ') || '(sin info)'}
- Artistas frecuentes: ${topArtistNames.slice(0, 12).join(', ')}

REGLAS ESTRICTAS:
- Devuelve 5-8 artistas (no más). Mejor pocos y certeros que muchos genéricos.
- NO incluyas nombres que aparezcan en esta lista a excluir (ya conocidos o presentes en su trama):
${excludeList.slice(0, 100).join(', ')}
- Cada sugerencia debe tener: nombre real, tipo ('musico' para solistas, 'banda' para grupos), descripción de UNA frase (≤15 palabras) que diga género + por qué pega con el perfil del usuario.
- Sé honesto: si el perfil es muy concentrado en un nicho, sugiere artistas DENTRO de ese nicho. No inventes género para variar.
- Si dudas si un artista es real, NO lo incluyas. Mejor 3 ciertos que 7 inventados.

DEVUELVE EXCLUSIVAMENTE este JSON, sin markdown:

{
  "suggestions": [
    {
      "name": "string",
      "type": "musico" | "banda",
      "description": "string corto en español",
      "reason": "string corto que enlaza con su perfil"
    }
  ]
}`

  try {
    const { content, usage, fromCache } = await askLLMForJson(
      [
        { role: 'system', content: system },
        { role: 'user', content: 'Sugiere artistas nuevos para descubrir.' },
      ],
      { provider: invocation.provider, model: invocation.model },
    )

    type Suggestion = {
      name: string
      type: 'musico' | 'banda'
      description: string
      reason: string
    }
    let suggestions: Suggestion[] = []
    if (
      content &&
      typeof content === 'object' &&
      Array.isArray((content as { suggestions?: unknown }).suggestions)
    ) {
      const raw = (content as { suggestions: unknown[] }).suggestions
      const existingSet = new Set(existingNames)
      const topSet = new Set(topArtistNames.map((n) => n.toLowerCase()))
      suggestions = raw
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
        .map((s) => ({
          name: typeof s.name === 'string' ? s.name.trim() : '',
          type: s.type === 'banda' ? 'banda' : 'musico',
          description: typeof s.description === 'string' ? s.description.trim() : '',
          reason: typeof s.reason === 'string' ? s.reason.trim() : '',
        }))
        .filter((s) => {
          if (!s.name) return false
          const key = s.name.toLowerCase()
          // Re-filter por si el LLM ignoró la regla.
          return !existingSet.has(key) && !topSet.has(key)
        })
    }

    logEvent({
      event: 'spotify_suggest_artists',
      provider: usage.provider,
      model: usage.model,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      costCents: usage.costCents,
      durationMs: usage.durationMs,
      fromCache,
      count: suggestions.length,
    })

    return Response.json({
      suggestions,
      provider: usage.provider,
      model: usage.model,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(`Error llamando al LLM: ${msg}`, { status: 502 })
  }
})

export const config: Config = {
  path: '/api/spotify/suggest-artists',
}
