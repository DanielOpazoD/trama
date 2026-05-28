/**
 * Bloque #5: Cliente API para el Atlas temático (constelaciones
 * semánticas de las entidades, agrupadas por embeddings).
 *
 * Endpoints:
 *   GET  /api/atlas            → snapshot guardado (cero costo LLM)
 *   POST /api/atlas/generate   → re-clusteriza + nombra con IA + persiste
 */
import { request } from './request'

export type AtlasMember = {
  id: string
  name: string
  type: string
  year: number | null
}

export type AtlasConstellation = {
  id: string
  name: string
  summary: string
  members: AtlasMember[]
}

export type AtlasResponse = {
  /** ISO del último snapshot, o null si nunca se generó. */
  generatedAt: string | null
  entityCount: number
  clusters: AtlasConstellation[]
}

export const atlasApi = {
  async read(): Promise<AtlasResponse> {
    return request('/api/atlas')
  },
  async generate(): Promise<AtlasResponse> {
    return request('/api/atlas/generate', { method: 'POST' })
  },
}
