/**
 * Favoritos — cliente de las páginas marcadas como favoritas. Entidad propia
 * (no recortes): un favorito es un marcador (URL + título + nota) para volver.
 * Transforma snake→camel en la frontera, como el resto de src/api.
 */
import { request } from './request'

export type Favorito = {
  id: string
  url: string
  title: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export type FavoritoRow = {
  id: string
  url: string
  title: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export function favoritoFromRow(r: FavoritoRow): Favorito {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export const favoritosApi = {
  async listFavoritos(): Promise<Favorito[]> {
    const rows = await request<FavoritoRow[]>('/api/favoritos')
    return rows.map(favoritoFromRow)
  },
  async createFavorito(input: {
    url: string
    title?: string | null
    note?: string | null
  }): Promise<Favorito> {
    const row = await request<FavoritoRow>('/api/favoritos', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return favoritoFromRow(row)
  },
  async updateFavorito(
    id: string,
    patch: { title?: string | null; note?: string | null },
  ): Promise<Favorito> {
    const row = await request<FavoritoRow>(`/api/favoritos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return favoritoFromRow(row)
  },
  async removeFavorito(id: string): Promise<{ deletedAt: string | null }> {
    const res = await request<{ ok: boolean; deletedAt?: string | null }>(
      `/api/favoritos/${id}`,
      { method: 'DELETE' },
    )
    return { deletedAt: res.deletedAt ?? null }
  },
  async restoreFavorito(id: string, deletedAt: string): Promise<void> {
    await request<{ restored: boolean }>(`/api/favoritos/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ deletedAt }),
    })
  },
}
