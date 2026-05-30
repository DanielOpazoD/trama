import { request } from './request'

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
  async xDisconnect(): Promise<void> {
    await request<void>('/api/x/status', { method: 'DELETE' })
  },
}
