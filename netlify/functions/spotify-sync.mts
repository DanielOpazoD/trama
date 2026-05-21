import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import {
  fetchRecentlyPlayed,
  getValidAccessToken,
  markSynced,
  storePlays,
} from './_lib/spotify.js'
import { withObservability } from './_lib/handler-wrap.js'

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

  const sql = getSql()

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
