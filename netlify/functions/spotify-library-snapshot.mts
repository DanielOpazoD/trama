import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { logEvent } from './_lib/observability.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import { askLLMForText } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { getAuthedUser } from './_lib/auth.js'
import {
  aggregateDecades,
  aggregateTopGenres,
  fetchSavedTracksCount,
  fetchTopArtists,
  fetchTopTracks,
  requireSpotifyConnection,
} from './_lib/spotify.js'

/**
 * POST /api/spotify/library-snapshot
 *
 * κ-spotify: genera un "retrato" sintético de la paleta musical del usuario,
 * mezclando tres lecturas de la Spotify API:
 *   - Saved tracks (me gusta): solo el TOTAL, no la lista entera.
 *   - Top artists (medium_term, 50): de ahí derivamos los géneros que más
 *     pesan en lo que escuchas; cada género se pondera por la popularity de
 *     los artistas que lo tienen.
 *   - Top tracks (medium_term, 50): de ahí derivamos la distribución de
 *     décadas (release_year).
 *
 * Sobre el conjunto agregado le pedimos a la IA UN párrafo breve (estilo
 * pull-quote editorial) describiendo la paleta — no como crítica, como
 * espejo. El usuario decide si lo guarda en su trama o no.
 *
 * El endpoint NO persiste el snapshot — la UI lo cachea en localStorage del
 * lado del cliente. Si en el futuro se quiere historial de paletas, agregamos
 * una tabla; hoy no lo necesitamos.
 */
export default withObservability(
  'spotify-library-snapshot',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }

    const { id: userId } = await getAuthedUser(req)

    const sql = getSql()
    const conn = await requireSpotifyConnection({ sql, userId, requestId })
    if (!conn.ok) return conn.response

    // Paralelizamos las tres llamadas a Spotify para que el endpoint no
    // sume latencias. Cada fetch ya tiene fallback a [] en caso de 403
    // (scope faltante) — el snapshot puede ser parcial si el usuario
    // conectó Spotify antes del scope user-library-read.
    let savedCount = 0
    let topArtists: Awaited<ReturnType<typeof fetchTopArtists>> = []
    let topTracks: Awaited<ReturnType<typeof fetchTopTracks>> = []
    try {
      ;[savedCount, topArtists, topTracks] = await Promise.all([
        fetchSavedTracksCount(conn.token).catch(() => 0),
        fetchTopArtists(conn.token, 'medium_term').catch(() => []),
        fetchTopTracks(conn.token, 'medium_term').catch(() => []),
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Spotify API error'
      return ApiErrors.upstream(requestId, msg)
    }

    const topGenres = aggregateTopGenres(topArtists, 8)
    const decades = aggregateDecades(topTracks)

    // Datos crudos para la respuesta UI — el AI summary va aparte.
    const aggregate = {
      savedCount,
      topGenres,
      topArtists: topArtists.slice(0, 10).map((a) => ({
        name: a.name,
        popularity: a.popularity,
        genres: a.genres.slice(0, 3),
      })),
      topTracks: topTracks.slice(0, 10).map((t) => ({
        name: t.name,
        artists: t.artistNames,
        year: t.releaseYear,
      })),
      decades,
    }

    // Si no hay nada significativo, no llamamos al LLM — el resumen sería
    // adivinanza. Devolvemos el agregado con summary vacío.
    const hasMeaningfulData =
      topGenres.length > 0 || topArtists.length >= 3 || savedCount > 0
    if (!hasMeaningfulData) {
      return Response.json({
        ...aggregate,
        aiSummary: null,
        provider: null,
        model: null,
      })
    }

    const budgetExceeded = await checkMonthlyBudget(userId, requestId)
    if (budgetExceeded) {
      // Devolvemos los datos pero sin párrafo (la UI ya sabe degradar).
      return Response.json({
        ...aggregate,
        aiSummary: null,
        provider: null,
        model: null,
      })
    }

    const invocation = await resolveAIInvocation(req, 'reflect', userId)
    if (invocation.kind === 'off') return aiOffResponse()

    const genresLine = topGenres
      .map((g) => g.name)
      .slice(0, 6)
      .join(', ')
    const artistsLine = aggregate.topArtists
      .slice(0, 6)
      .map((a) => a.name)
      .join(', ')
    const decadesLine = decades
      .map((d) => `${d.decade} (${d.count})`)
      .join(', ')

    const system = `Eres un colaborador del usuario en su mapa cognitivo personal "Trama". El usuario te muestra el extracto de su paleta musical en Spotify y te pide un retrato breve.

Tu trabajo: escribir UN solo párrafo (máximo 4-5 oraciones, 80 palabras como máximo) en español, voz literaria y reflexiva. No enumeras los datos: los lees. No usas frases tipo "tus géneros son…" — describes el TONO de esa paleta: melancolías, energías, épocas afines, qué cosas conviven que normalmente no conviven.

REGLAS:
- Sin markdown ni viñetas. Solo prosa.
- No empieces con "Tu música…" ni "Te gusta…". Empieza con la idea.
- Si los géneros son muy genéricos (pop, rock), aborda el patrón completo, no cada uno.
- No inventes datos que no estén abajo. Si los datos son escasos, una frase honesta sobre los límites es mejor que rellenar.

Datos:
- Géneros con más peso: ${genresLine || '(sin información)'}
- Artistas más escuchados: ${artistsLine || '(sin información)'}
- Distribución por décadas: ${decadesLine || '(sin información)'}
- Tracks guardados ("me gusta"): ${savedCount.toLocaleString('es')}

Devuelve SOLO el párrafo.`

    try {
      const { content, usage, fromCache } = await askLLMForText(
        [
          { role: 'system', content: system },
          { role: 'user', content: 'Escribe el retrato de la paleta.' },
        ],
        { provider: invocation.provider, model: invocation.model },
      )
      const aiSummary = typeof content === 'string' ? content.trim() : String(content).trim()

      logEvent({
        event: 'spotify_palette_completed',
        provider: usage.provider,
        model: usage.model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costCents: usage.costCents,
        durationMs: usage.durationMs,
        fromCache,
      })

      sql`
        INSERT INTO extraction_log (
          input_text, proposal, provider, model, tokens_in, tokens_out, cost_cents, duration_ms, user_id
        ) VALUES (
          'spotify:palette',
          ${JSON.stringify({ savedCount, topGenres, decades })}::jsonb,
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
        ...aggregate,
        aiSummary,
        provider: usage.provider,
        model: usage.model,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Si el LLM falla, devolvemos los datos sin párrafo — la UI degrada
      // mostrando solo la paleta cruda, que ya es valor.
      return Response.json({
        ...aggregate,
        aiSummary: null,
        provider: null,
        model: null,
        aiError: msg,
      })
    }
  },
)

export const config: Config = {
  path: '/api/spotify/library-snapshot',
}
