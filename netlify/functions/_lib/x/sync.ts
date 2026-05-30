/**
 * Trae los bookmarks del usuario desde la API v2 de X y los persiste.
 *
 * GET /2/users/:id/bookmarks (contexto de usuario, scope bookmark.read). Solo
 * se pueden leer los bookmarks PROPIOS. Dedup por (user_id, tweet_id).
 */

import { API_BASE, type SqlClient } from './client.js'

type BookmarkTweet = {
  id: string
  text: string
  created_at?: string
  author_id?: string
}
type BookmarksResponse = {
  data?: BookmarkTweet[]
  includes?: { users?: Array<{ id: string; username: string; name?: string | null }> }
}

export type NormalizedBookmark = {
  tweetId: string
  text: string
  authorId: string | null
  authorName: string | null
  authorUsername: string | null
  createdAt: string | null
  url: string
}

/** Trae una página de bookmarks (hasta 100) y los normaliza. */
export async function fetchBookmarks(
  accessToken: string,
  xUserId: string,
): Promise<NormalizedBookmark[]> {
  const params = new URLSearchParams({
    max_results: '100',
    'tweet.fields': 'created_at',
    expansions: 'author_id',
    'user.fields': 'username,name',
  })
  const r = await fetch(`${API_BASE}/users/${xUserId}/bookmarks?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) {
    throw new Error(`X bookmarks fetch failed (${r.status}): ${await r.text()}`)
  }
  const data = (await r.json()) as BookmarksResponse
  const usersById = new Map((data.includes?.users ?? []).map((u) => [u.id, u] as const))
  return (data.data ?? []).map((t) => {
    const author = t.author_id ? usersById.get(t.author_id) : undefined
    const username = author?.username ?? null
    return {
      tweetId: t.id,
      text: t.text,
      authorId: t.author_id ?? null,
      authorName: author?.name ?? null,
      authorUsername: username,
      createdAt: t.created_at ?? null,
      url: `https://x.com/${username ?? 'i'}/status/${t.id}`,
    }
  })
}

/** Guarda bookmarks nuevos. Devuelve cuántos se insertaron (dedup por tweet). */
export async function storeBookmarks(
  sql: SqlClient,
  items: NormalizedBookmark[],
  userId: string,
): Promise<number> {
  let inserted = 0
  for (const b of items) {
    const rows = (await sql`
      INSERT INTO x_bookmarks (
        tweet_id, text, author_id, author_name, author_username,
        tweet_created_at, url, user_id
      ) VALUES (
        ${b.tweetId},
        ${b.text},
        ${b.authorId},
        ${b.authorName},
        ${b.authorUsername},
        ${b.createdAt},
        ${b.url},
        ${userId}
      )
      ON CONFLICT (user_id, tweet_id) DO NOTHING
      RETURNING id
    `) as Array<{ id: string }>
    if (rows.length > 0) inserted++
  }
  return inserted
}
