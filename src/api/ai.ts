/**
 * Caminos IA que no son chat ni reflect:
 *   - extract (texto libre → propuestas)
 *   - extract-from-image (vision + multimodal)
 *   - ask (one-shot con contexto de vista)
 *   - suggest-relationships (escaneo de la trama)
 *   - reclassify-entities (revisión de tipos)
 *   - proactive-suggestions (sugerencias periódicas opt-in)
 */

import type { ExtractionProposal } from '../types'
import { request } from './request'
import type { AskResponse } from './chat'

export type ProactiveSuggestion = {
  id: string
  kind: 'relationship' | 'reclassification' | 'description' | string
  payload: {
    fromName?: string
    toName?: string
    type?: string
    entityId?: string
    name?: string
    oldType?: string
    newType?: string
    description?: string
    reason?: string
  }
  status: 'pending' | 'applied' | 'dismissed'
  provider: string | null
  model: string | null
  createdAt: string
  statusChangedAt: string | null
}

export type Reclassification = {
  id: string
  name: string
  oldType: string
  newType: string
  reason?: string
  verification?: { agreed: boolean; note?: string; verifier: string }
}

export type ReclassifyResponse = {
  reclassifications: Reclassification[]
  /** Provider + modelo que propuso las reclasificaciones. */
  provider?: string | null
  model?: string | null
}

export const aiApi = {
  async extract(text: string): Promise<ExtractionProposal> {
    return request<ExtractionProposal>('/api/extract', {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
  },

  async extractFromImage(
    imageBase64: string,
    mimeType: string,
  ): Promise<ExtractionProposal> {
    return request<ExtractionProposal>('/api/extract-from-image', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType }),
    })
  },

  async ask(
    text: string,
    options?: {
      view?: string | null
      selectedEntityId?: string | null
      /** Section thread id; if omitted, the server creates one and returns it. */
      threadId?: string | null
    },
  ): Promise<AskResponse> {
    return request<AskResponse>('/api/ask', {
      method: 'POST',
      body: JSON.stringify({
        text,
        view: options?.view ?? null,
        selectedEntityId: options?.selectedEntityId ?? null,
        threadId: options?.threadId ?? null,
      }),
    })
  },

  async suggestRelationships(opts?: {
    /** η2: lista de proposals que el usuario descartó previamente. La IA
        las recibe como "no las repitas" y propone otras. */
    avoidPrevious?: Array<{ fromName: string; toName: string; type: string }>
  }): Promise<ExtractionProposal> {
    return request<ExtractionProposal>('/api/suggest-relationships', {
      method: 'POST',
      body: JSON.stringify({
        avoidPrevious: opts?.avoidPrevious ?? [],
      }),
    })
  },

  async reclassifyEntities(): Promise<ReclassifyResponse> {
    return request<ReclassifyResponse>('/api/reclassify-entities', {
      method: 'POST',
      body: '{}',
    })
  },

  async listProactiveSuggestions(
    status: 'pending' | 'applied' | 'dismissed' = 'pending',
  ): Promise<ProactiveSuggestion[]> {
    return request<ProactiveSuggestion[]>(`/api/proactive-suggestions?status=${status}`)
  },
  async generateProactiveSuggestions(): Promise<{
    inserted: number
    suggestions: ProactiveSuggestion[]
  }> {
    return request('/api/proactive-suggestions', { method: 'POST', body: '{}' })
  },
  async resolveProactiveSuggestion(
    id: string,
    status: 'applied' | 'dismissed',
  ): Promise<void> {
    await request<void>(`/api/proactive-suggestions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },
}
