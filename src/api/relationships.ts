/**
 * Relaciones: CRUD + paginación cursor.
 */

import type { Relationship } from '../types'
import { request } from './request'
import { relationshipFromRow, type RelationshipRow } from './transform'

export const relationshipsApi = {
  async listRelationships(): Promise<Relationship[]> {
    const rows = await request<RelationshipRow[]>('/api/relationships')
    return rows.map(relationshipFromRow)
  },
  async listRelationshipsPage(
    limit: number,
    cursor: string | null,
  ): Promise<{ items: Relationship[]; nextCursor: string | null }> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    const res = await request<{ items: RelationshipRow[]; nextCursor: string | null }>(
      `/api/relationships?${params.toString()}`,
    )
    return {
      items: res.items.map(relationshipFromRow),
      nextCursor: res.nextCursor,
    }
  },
  async createRelationship(
    data: Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Relationship> {
    const row = await request<RelationshipRow>('/api/relationships', {
      method: 'POST',
      body: JSON.stringify({
        from_id: data.fromId,
        to_id: data.toId,
        type: data.type,
        notes: data.notes ?? null,
        origin: data.origin,
      }),
    })
    return relationshipFromRow(row)
  },
  async updateRelationship(
    id: string,
    patch: Partial<{ type: string; notes: string | null }>,
  ): Promise<Relationship> {
    const body: Record<string, unknown> = {}
    if (patch.type !== undefined) body.type = patch.type
    if (patch.notes !== undefined) body.notes = patch.notes
    const row = await request<RelationshipRow>(`/api/relationships/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return relationshipFromRow(row)
  },
  async deleteRelationship(id: string): Promise<{ deletedAt: string }> {
    return request<{ deletedAt: string }>(`/api/relationships/${id}`, { method: 'DELETE' })
  },
  async restoreRelationship(id: string, deletedAt: string): Promise<void> {
    await request<{ restored: boolean }>(`/api/relationships/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ deletedAt }),
    })
  },
}
