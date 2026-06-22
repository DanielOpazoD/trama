/**
 * Trae los bookmarks del usuario desde la API v2 de X y los persiste.
 *
 * GET /2/users/:id/bookmarks (contexto de usuario, scope bookmark.read). Solo
 * se pueden leer los bookmarks PROPIOS. Dedup por (user_id, tweet_id).
 */

import { API_BASE, type SqlClient } from './client.js'
import { XBookmarksResponse } from './schemas.js'

export type NormalizedBookmark = {
  tweetId: string
  text: string
  authorId: string | null
  authorName: string | null
  authorUsername: string | null
  createdAt: string | null
  url: string
}

/** Error de la API de X con el status HTTP + body crudo, para mapear a un
 * mensaje claro (X devuelve `title`/`reason`/`detail` en el JSON del error). */
export class XApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`X API ${status}: ${body.slice(0, 200)}`)
    this.name = 'XApiError'
  }
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
    throw new XApiError(r.status, await r.text())
  }
  const data = XBookmarksResponse.parse(await r.json())
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

export type StoredBookmark = {
  id: string
  tweet_id: string
  text: string
  author_id: string | null
  author_name: string | null
  author_username: string | null
  tweet_created_at: string | null
  url: string | null
  captured_at: string
  topic: string | null
}

/**
 * Lista los bookmarks vivos del usuario, ordenados por fecha del tweet (para la
 * navegación por año/mes de la vista). El agrupado por fecha y el filtro por
 * tema se hacen client-side; a escala personal traer todo (capado) es lo más
 * simple y correcto.
 */
export async function listBookmarks(
  sql: SqlClient,
  userId: string,
  limit: number,
): Promise<StoredBookmark[]> {
  const rows = await sql`
    SELECT id, tweet_id, text, author_id, author_name, author_username,
           tweet_created_at, url, captured_at, topic
    FROM x_bookmarks
    WHERE user_id = ${userId} AND deleted_at IS NULL
    ORDER BY tweet_created_at DESC NULLS LAST, captured_at DESC
    LIMIT ${limit}
  `
  return rows as StoredBookmark[]
}

/** Soft-delete de un bookmark (lo quita de Trama; no toca X). */
export async function deleteBookmark(
  sql: SqlClient,
  userId: string,
  id: string,
): Promise<boolean> {
  const rows = (await sql`
    UPDATE x_bookmarks
    SET deleted_at = NOW()
    WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    RETURNING id
  `) as Array<{ id: string }>
  return rows.length > 0
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
