import { request } from './request'

/** Un bookmark de X guardado (fila de x_bookmarks, ya en camelCase). */
export type XBookmark = {
  id: string
  tweetId: string
  text: string
  authorName: string | null
  authorUsername: string | null
  tweetCreatedAt: string | null
  url: string | null
  capturedAt: string
}

/** Estado de conexión con X (Twitter). */
export type XStatus =
  | { connected: false }
  | {
      connected: true
      username: string | null
      xUserId: string | null
      lastSyncedAt: string | null
      counts: { totalBookmarks: number }
    }

export const xApi = {
  async xStatus(): Promise<XStatus> {
    return request<XStatus>('/api/x/status')
  },
  /**
   * Arranca el OAuth2 (PKCE) de X autenticado; el server setea las cookies del
   * flujo. El caller navega a `url`. En modo prueba no hay `url` y no se navega.
   */
  async xLogin(): Promise<{ url?: string }> {
    return request<{ url?: string }>('/api/x/login')
  },
  async xSync(): Promise<{ fetched: number; inserted: number }> {
    return request('/api/x/sync', { method: 'POST' })
  },
  /** Lista los bookmarks guardados (más recientes primero, paginado por cursor). */
  async xBookmarks(
    limit = 50,
    cursor: string | null = null,
  ): Promise<{ items: XBookmark[]; nextCursor: string | null }> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    return request<{ items: XBookmark[]; nextCursor: string | null }>(
      `/api/x/bookmarks?${params.toString()}`,
    )
  },
  async xDisconnect(): Promise<void> {
    await request<void>('/api/x/status', { method: 'DELETE' })
  },
}
