import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * GET /api/spotify/timing?since=ISO_DATE
 *
 * π4: devuelve los timestamps crudos de reproducción dentro del período,
 * para que el cliente agregue en TZ LOCAL (heatmap hora/día, trend diario).
 *
 * Por qué client-side: "escucho a las 11pm" es una afirmación en HORA
 * LOCAL del usuario. Si el server agrupa en UTC, el heatmap mostraría
 * patrones desplazados ~3h en Sudamérica. La forma honesta es mandar
 * los timestamps y dejar que Date.getHours() del browser haga la
 * conversión.
 *
 * Volumen: 90 días × ~10 plays/día = ~900 timestamps = ~27KB JSON.
 * Cap defensivo a 20000 timestamps por si el usuario tiene historial
 * masivo y pide 1 año.
 */
const MAX_TIMESTAMPS = 20000

export default withObservability('spotify-timing', async (req, _ctx, { requestId }) => {
  if (req.method !== 'GET') {
    return ApiErrors.methodNotAllowed(requestId)
  }

  const { id: userId } = await getAuthedUser(req)

  const url = new URL(req.url)
  const sinceParam = url.searchParams.get('since')
  const since =
    sinceParam ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const sql = getSql()

  type Row = { played_at: string | Date }
  const rows = (await sql`
    SELECT played_at
    FROM spotify_plays
    WHERE played_at >= ${since} AND user_id = ${userId}
    ORDER BY played_at ASC
    LIMIT ${MAX_TIMESTAMPS}
  `) as Row[]

  // Normalizamos a ISO string (Neon devuelve Date objects, no strings).
  const playedAts = rows.map((r) =>
    typeof r.played_at === 'string'
      ? r.played_at
      : new Date(r.played_at).toISOString(),
  )

  return Response.json({
    since,
    playedAts,
    truncated: rows.length >= MAX_TIMESTAMPS,
  })
})

export const config: Config = {
  path: '/api/spotify/timing',
}
