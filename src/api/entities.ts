/**
 * Entidades: CRUD + lookup helpers + búsqueda de duplicados.
 *
 * El cliente HTTP delegado a `request()` lanza `DuplicateEntityError` ante un
 * 409 sobre /api/entities — los callers de `createEntity()` deben atraparlo
 * para mostrar el dropdown "¿quisiste decir …?".
 */

import type { Entity } from '../types'
import { request } from './request'
import { entityFromRow, type EntityRow } from './transform'

export const entitiesApi = {
  async listEntitiesPage(
    limit: number,
    cursor: string | null,
  ): Promise<{ items: Entity[]; nextCursor: string | null }> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    const res = await request<{ items: EntityRow[]; nextCursor: string | null }>(
      `/api/entities?${params.toString()}`,
    )
    return {
      items: res.items.map(entityFromRow),
      nextCursor: res.nextCursor,
    }
  },
  async listEntities(): Promise<Entity[]> {
    const rows = await request<EntityRow[]>('/api/entities')
    return rows.map(entityFromRow)
  },
  async createEntity(
    data: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>,
    options?: { force?: boolean },
  ): Promise<Entity> {
    const url = options?.force ? '/api/entities?force=true' : '/api/entities'
    const row = await request<EntityRow>(url, {
      method: 'POST',
      body: JSON.stringify({
        type: data.type,
        name: data.name,
        year: data.year ?? null,
        description: data.description ?? null,
        position_x: data.positionX ?? null,
        position_y: data.positionY ?? null,
        origin: data.origin,
        spotify_url: data.spotifyUrl ?? null,
      }),
    })
    return entityFromRow(row)
  },
  async updateEntityPosition(id: string, positionX: number, positionY: number): Promise<void> {
    await request<void>(`/api/entities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ position_x: positionX, position_y: positionY }),
    })
  },
  async updateEntity(
    id: string,
    patch: Partial<{
      name: string
      type: string
      year: number | null
      description: string | null
      essay: string | null
      spotifyUrl: string | null
    }>,
  ): Promise<Entity> {
    const body: Record<string, unknown> = {}
    if (patch.name !== undefined) body.name = patch.name
    if (patch.type !== undefined) body.type = patch.type
    if (patch.year !== undefined) body.year = patch.year
    if (patch.description !== undefined) body.description = patch.description
    if (patch.essay !== undefined) body.essay = patch.essay
    if (patch.spotifyUrl !== undefined) body.spotify_url = patch.spotifyUrl
    const row = await request<EntityRow>(`/api/entities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return entityFromRow(row)
  },
  async updateEntityType(id: string, type: string): Promise<void> {
    await request<void>(`/api/entities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ type }),
    })
  },
  async deleteEntity(id: string): Promise<{ deletedAt: string }> {
    return request<{ deletedAt: string }>(`/api/entities/${id}`, { method: 'DELETE' })
  },
  async restoreEntity(id: string, deletedAt: string): Promise<void> {
    await request<{ restored: boolean }>(`/api/entities/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ deletedAt }),
    })
  },

  // Lookup helpers: usar estos en vez de cargar la lista completa de
  // entidades y filtrarla en memoria. A 100k es lo único viable.
  async lookupEntityByName(name: string): Promise<Entity[]> {
    if (!name.trim()) return []
    const rows = await request<EntityRow[]>(
      `/api/entities-lookup?name=${encodeURIComponent(name)}`,
    )
    return rows.map(entityFromRow)
  },
  async lookupEntitiesByPrefix(prefix: string): Promise<Entity[]> {
    if (!prefix.trim()) return []
    const rows = await request<EntityRow[]>(
      `/api/entities-lookup?prefix=${encodeURIComponent(prefix)}`,
    )
    return rows.map(entityFromRow)
  },
  async getEntitiesByIds(ids: string[]): Promise<Entity[]> {
    if (ids.length === 0) return []
    const rows = await request<EntityRow[]>(
      `/api/entities-lookup?ids=${ids.map(encodeURIComponent).join(',')}`,
    )
    return rows.map(entityFromRow)
  },

  /** DD3: counts de citas y relaciones por entidad. EntitiesView lo usa
      para mostrar "N citas · M relaciones" en cada row sin descargar
      wholesome useQuotesQuery + useRelationshipsQuery. */
  async listEntityRefsCount(): Promise<{
    items: Array<{ id: string; quoteCount: number; relCount: number }>
  }> {
    return request('/api/entities-refs-count')
  },
}
