/**
 * CRUD para las tablas de catálogos: entity_types y relationship_types.
 * Los slugs aceptados son lowercase + dígitos + underscores.
 */

import { request } from './request'

export const typeTablesApi = {
  async listEntityTypes(): Promise<Array<{ slug: string; label: string; sort_order: number }>> {
    return request('/api/entity-types')
  },
  async upsertEntityType(data: { slug: string; label: string; sort_order?: number }) {
    return request('/api/entity-types', { method: 'POST', body: JSON.stringify(data) })
  },
  async deleteEntityType(slug: string): Promise<void> {
    await request<void>(`/api/entity-types/${slug}`, { method: 'DELETE' })
  },

  async listRelationshipTypes(): Promise<Array<{ slug: string; label: string; reverse_label: string; sort_order: number }>> {
    return request('/api/relationship-types')
  },
  async upsertRelationshipType(data: { slug: string; label: string; reverse_label: string; sort_order?: number }) {
    return request('/api/relationship-types', { method: 'POST', body: JSON.stringify(data) })
  },
  async deleteRelationshipType(slug: string): Promise<void> {
    await request<void>(`/api/relationship-types/${slug}`, { method: 'DELETE' })
  },
}
