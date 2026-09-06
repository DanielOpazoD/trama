/**
 * Cliente de consultas guardadas (Fase 4). Persisten un AST de query (el mismo
 * shape de `queryApi`) con nombre, para reusarlas y embeberlas como bloques.
 */
import { request, requestContract } from './request'
import type { QueryInput } from './query'

export type SavedQuery = {
  id: string
  name: string
  description: string | null
  query: QueryInput
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export type SavedQueryCreate = {
  name: string
  query: QueryInput
  description?: string
  pinned?: boolean
}

export type SavedQueryPatch = {
  name?: string
  query?: QueryInput
  description?: string
  pinned?: boolean
}

export const savedQueriesApi = {
  listSavedQueries(): Promise<{ items: SavedQuery[] }> {
    return requestContract<{ items: SavedQuery[] }>(
      'savedQueries',
      '/api/saved-queries',
      {
        method: 'GET',
      },
    )
  },

  createSavedQuery(input: SavedQueryCreate): Promise<SavedQuery> {
    return request<SavedQuery>('/api/saved-queries', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  updateSavedQuery(id: string, patch: SavedQueryPatch): Promise<SavedQuery> {
    return request<SavedQuery>('/api/saved-queries', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...patch }),
    })
  },

  deleteSavedQuery(id: string): Promise<void> {
    return request<void>('/api/saved-queries', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    })
  },
}
