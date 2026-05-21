import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'
import {
  fetchRecentlyPlayed,
  getValidAccessToken,
  markSynced,
  storePlays,
} from './_lib/spotify.js'
import { withObservability } from './_lib/handler-wrap.js'
import { rateLimit } from './_lib/rate-limit.js'

/**
 * Fetches recent plays from Spotify and stores them. Idempotent: re-running
 * doesn't create duplicates.
 *
 * Spotify only retains the 50 most-recent plays; if you don't sync at least
 * once an hour or two, you may lose plays. (Future: a Netlify scheduled
 * function can run this every 30 min automatically.)
 */
export default withObservability('spotify-sync', async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Modest rate limit: sync at most 10 times per minute.
  const blocked = rateLimit(req, { max: 10, windowMs: 60_000, key: 'spotify-sync' })
  if (blocked) return blocked

  const connectionString = Netlify.env.get('NETLIFY_DATABASE_URL')
  if (!connectionString) {
    return new Response('NETLIFY_DATABASE_URL no está configurada', { status: 500 })
  }
  const sql = neon(connectionString)

  const accessToken = await getValidAccessToken(sql)
  if (!accessToken) {
    return new Response('Spotify no está conectado', { status: 400 })
  }

  const data = await fetchRecentlyPlayed(accessToken)
  const inserted = await storePlays(sql, data.items)
  await markSynced(sql)

  return Response.json({
    fetched: data.items.length,
    inserted,
    mostRecentPlay: data.items[0]?.played_at ?? null,
  })
})

export const config: Config = {
  path: '/api/spotify/sync',
}
