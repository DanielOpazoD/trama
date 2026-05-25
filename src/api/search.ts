/**
 * Búsqueda híbrida (lexical tsvector + semántica pgvector con RRF + LLM
 * rerank opcional). Modos: 'hybrid' (default), 'lexical', 'semantic'.
 */

import { request } from './request'

export type SearchEntityHit = {
  id: string
  name: string
  type: string
  description: string | null
  year: number | null
  score: number
  lexical: number
  semantic: number
}

export type SearchQuoteHit = {
  id: string
  entityId: string
  entityName: string
  text: string
  source: string | null
  score: number
  lexical: number
  semantic: number
}

export type SearchResponse = {
  entities: SearchEntityHit[]
  quotes: SearchQuoteHit[]
  mode: 'hybrid' | 'lexical' | 'semantic'
}

export const searchApi = {
  /**
   * Hybrid (lexical + semantic) search. Returns top entities and quotes
   * matching the query, ranked by combined score.
   */
  async search(q: string, options?: { limit?: number; mode?: 'hybrid' | 'lexical' | 'semantic' }):
    Promise<SearchResponse> {
    const params = new URLSearchParams({ q })
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.mode) params.set('mode', options.mode)
    return request<SearchResponse>(`/api/search?${params.toString()}`)
  },
}
