/**
 * Citas: CRUD + reflect (reflexión IA on-demand).
 *
 * `updateQuote.patch.pinned` setea/desactiva pinned_at en el servidor (ω-E).
 * `aiReflection*` se persisten sólo cuando el usuario guarda explícitamente
 * la interpretación que vino del LLM.
 */

import type { Quote } from '../types'
import { request } from './request'
import { quoteFromRow, type QuoteRow } from './transform'

export const quotesApi = {
  async listQuotes(): Promise<Quote[]> {
    const rows = await request<QuoteRow[]>('/api/quotes')
    return rows.map(quoteFromRow)
  },
  /** Cursor-paginated list. `cursor` null/undefined fetches the first page. */
  async listQuotesPage(
    limit: number,
    cursor: string | null,
  ): Promise<{ items: Quote[]; nextCursor: string | null }> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    const res = await request<{ items: QuoteRow[]; nextCursor: string | null }>(
      `/api/quotes?${params.toString()}`,
    )
    return {
      items: res.items.map(quoteFromRow),
      nextCursor: res.nextCursor,
    }
  },
  async createQuote(
    data: Omit<Quote, 'id' | 'createdAt' | 'updatedAt' | 'linkedQuoteIds'> & {
      linkedQuoteIds?: string[]
    },
  ): Promise<Quote> {
    const row = await request<QuoteRow>('/api/quotes', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: data.entityId,
        text: data.text,
        source: data.source ?? null,
        context: data.context ?? null,
        link: data.link ?? null,
        user_reflection: data.userReflection ?? null,
        linked_quote_ids: data.linkedQuoteIds ?? [],
        origin: data.origin,
      }),
    })
    return quoteFromRow(row)
  },
  async updateQuote(
    id: string,
    patch: Partial<{
      text: string
      source: string | null
      context: string | null
      entityId: string
      userReflection: string | null
      aiReflection: string | null
      aiReflectionProvider: string | null
      aiReflectionModel: string | null
      linkedQuoteIds: string[]
      /** ω-E: marcar/desmarcar como favorita. true → set pinned_at = NOW().
          false → null. undefined → no se toca. */
      pinned: boolean
      /** U-1: resonancia 1-5. null = destildar. undefined → no se toca. */
      resonance: number | null
      /** ρ-citas: hipervínculo. null = quitar. undefined → no se toca. */
      link: string | null
    }>,
  ): Promise<Quote> {
    const body: Record<string, unknown> = {}
    if (patch.text !== undefined) body.text = patch.text
    if (patch.source !== undefined) body.source = patch.source
    if (patch.context !== undefined) body.context = patch.context
    if (patch.entityId !== undefined) body.entity_id = patch.entityId
    if (patch.userReflection !== undefined) body.user_reflection = patch.userReflection
    if (patch.aiReflection !== undefined) body.ai_reflection = patch.aiReflection
    if (patch.aiReflectionProvider !== undefined)
      body.ai_reflection_provider = patch.aiReflectionProvider
    if (patch.aiReflectionModel !== undefined)
      body.ai_reflection_model = patch.aiReflectionModel
    if (patch.linkedQuoteIds !== undefined) body.linked_quote_ids = patch.linkedQuoteIds
    if (patch.pinned !== undefined) body.pinned = patch.pinned
    if (patch.resonance !== undefined) body.resonance = patch.resonance
    if (patch.link !== undefined) body.link = patch.link
    const row = await request<QuoteRow>(`/api/quotes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return quoteFromRow(row)
  },
  async reflectQuote(
    id: string,
  ): Promise<{ reflection: string; provider: string; model: string }> {
    return request(`/api/quotes/${id}/reflect`, { method: 'POST', body: '{}' })
  },
  /**
   * U-2: Eco. Top-3 citas más similares a la dada (excluyendo la propia),
   * vía embedding. Es lectura solamente — no muta la cita base.
   */
  async getQuoteEchoes(
    id: string,
  ): Promise<
    Array<{ id: string; entityName: string; text: string; source: string | null }>
  > {
    return request(`/api/quotes/${id}/echoes`)
  },
  async deleteQuote(id: string): Promise<{ deletedAt: string }> {
    return request<{ deletedAt: string }>(`/api/quotes/${id}`, { method: 'DELETE' })
  },
  async restoreQuote(id: string, deletedAt: string): Promise<void> {
    await request<{ restored: boolean }>(`/api/quotes/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ deletedAt }),
    })
  },
}
