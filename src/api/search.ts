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

export type SearchMomentoHit = {
  id: string
  kind: string
  text: string
  capturedAt: string
  score: number
}

export type SearchCronicaHit = {
  id: string
  year: number
  month: number
  text: string
  score: number
}

export type SearchChatHit = {
  id: string
  threadId: string
  threadTitle: string | null
  role: string
  text: string
  score: number
}

export type SearchResponse = {
  entities: SearchEntityHit[]
  quotes: SearchQuoteHit[]
  momentos: SearchMomentoHit[]
  cronicas: SearchCronicaHit[]
  chat: SearchChatHit[]
  mode: 'hybrid' | 'lexical' | 'semantic'
}

export const searchApi = {
  /**
   * Hybrid (lexical + semantic) search. Returns top entities and quotes
   * matching the query, ranked by combined score.
   */
  async search(
    q: string,
    options?: { limit?: number; mode?: 'hybrid' | 'lexical' | 'semantic' },
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({ q })
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.mode) params.set('mode', options.mode)
    return request<SearchResponse>(`/api/search?${params.toString()}`)
  },
}
