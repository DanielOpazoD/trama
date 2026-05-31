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
  /** Tema asignado por la IA (null = sin clasificar todavía). */
  topic: string | null
}

/** Crónica de bookmarks (ensayo IA sobre lo que guardás en X). */
export type XCronica = {
  id: string
  text: string
  sourceCount: number
  generatedAt: string
  provider: string | null
  model: string | null
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
  async xSync(): Promise<{ fetched: number; inserted: number; classified?: number }> {
    return request('/api/x/sync', { method: 'POST' })
  },
  /** Clasifica por tema (IA) los bookmarks sin tema. `remaining` = quedan más. */
  async xClassify(): Promise<{ classified: number; remaining: boolean }> {
    return request('/api/x/classify', { method: 'POST' })
  },
  /** La crónica de bookmarks más reciente (o null). */
  async xCronica(): Promise<{ cronica: XCronica | null }> {
    return request('/api/x/cronica')
  },
  /** Genera (y persiste) una crónica nueva a partir de tus bookmarks. */
  async xGenerateCronica(): Promise<{ cronica: XCronica }> {
    return request('/api/x/cronica', { method: 'POST' })
  },
  /** Lista los bookmarks vivos (ordenados por fecha del tweet). La vista agrupa
   * por año/mes y filtra por tema client-side. */
  async xBookmarks(): Promise<{ items: XBookmark[] }> {
    return request<{ items: XBookmark[] }>('/api/x/bookmarks')
  },
  /** Quita un bookmark de Trama (soft-delete; no toca X). */
  async xDeleteBookmark(id: string): Promise<void> {
    await request<{ ok: boolean }>(`/api/x/bookmarks?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
  async xDisconnect(): Promise<void> {
    await request<void>('/api/x/status', { method: 'DELETE' })
  },
}
