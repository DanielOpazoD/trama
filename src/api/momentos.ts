/**
 * Momentos: CRUD + URL preview + upload de imágenes a Netlify Blobs.
 *
 * Recordatorio (CLAUDE.md): los paths de momentos son `/api/momentos-X`
 * (con hyphen) y NO `/api/momentos/X` — el handler de momentos.mts
 * matchearía "X" como un :id y devolvería 405.
 */

import type { Momento, MomentoKind, MomentoPayload, Origin } from '../types'
import { aiModeHeader, request } from './request'
import { momentoFromRow, type MomentoRow } from './transform'

export type MomentoUrlPreview = {
  url: string
  title: string | null
  description: string | null
  source: string | null
  author: string | null
  image: string | null
  fetched: boolean
}

export const momentosApi = {
  async listMomentos(opts?: {
    cursor?: string | null
    limit?: number
    kind?: MomentoKind
  }): Promise<{ items: Momento[]; nextCursor: string | null }> {
    const params = new URLSearchParams()
    if (opts?.cursor) params.set('cursor', opts.cursor)
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.kind) params.set('kind', opts.kind)
    const q = params.toString()
    const res = await request<{
      items: MomentoRow[]
      nextCursor: string | null
    }>(`/api/momentos${q ? `?${q}` : ''}`)
    return {
      items: res.items.map(momentoFromRow),
      nextCursor: res.nextCursor,
    }
  },

  async getMomento(id: string): Promise<Momento> {
    const row = await request<MomentoRow>(`/api/momentos/${id}`)
    return momentoFromRow(row)
  },

  async createMomento(data: {
    kind: MomentoKind
    payload: MomentoPayload
    note?: string | null
    capturedAt?: string
    entityIds?: string[]
    origin?: Origin
  }): Promise<Momento> {
    const row = await request<MomentoRow>('/api/momentos', {
      method: 'POST',
      body: JSON.stringify({
        kind: data.kind,
        payload: data.payload,
        note: data.note ?? null,
        captured_at: data.capturedAt,
        entity_ids: data.entityIds ?? [],
        origin: data.origin ?? { kind: 'manual' },
      }),
    })
    return momentoFromRow(row)
  },

  async updateMomento(
    id: string,
    patch: Partial<{
      payload: MomentoPayload
      note: string | null
      capturedAt: string
      entityIds: string[]
    }>,
  ): Promise<Momento> {
    const body: Record<string, unknown> = {}
    if (patch.payload !== undefined) body.payload = patch.payload
    if (patch.note !== undefined) body.note = patch.note
    if (patch.capturedAt !== undefined) body.captured_at = patch.capturedAt
    if (patch.entityIds !== undefined) body.entity_ids = patch.entityIds
    const row = await request<MomentoRow>(`/api/momentos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return momentoFromRow(row)
  },

  async deleteMomento(id: string): Promise<{ deletedAt: string }> {
    return request<{ deletedAt: string }>(`/api/momentos/${id}`, {
      method: 'DELETE',
    })
  },

  /** ξ2: server-side fetch del OG/Twitter meta de una URL. */
  async momentoUrlPreview(url: string): Promise<MomentoUrlPreview> {
    // υ-bugfix: path movido de `/api/momentos/url-preview` a
    // `/api/momentos-url-preview` porque `:id` de momentos.mts matcheaba
    // "url-preview" como un id y rechazaba el GET.
    return request<MomentoUrlPreview>(
      `/api/momentos-url-preview?url=${encodeURIComponent(url)}`,
    )
  },

  /** EE: fusiona N momentos foto en uno solo. El primary sobrevive con
      todos los items combinados; los otros quedan soft-deleted.
      Devuelve `deletedOthers: [{ id, deletedAt }]` para que el cliente
      pueda ofrecer "deshacer" via restoreMomento. */
  async mergeMomentos(input: {
    primaryId: string
    otherIds: string[]
    note?: string | null
    capturedAt?: string
  }): Promise<
    Momento & {
      merged: number
      itemCount: number
      deletedOthers: Array<{ id: string; deletedAt: string }>
    }
  > {
    return request('/api/momentos-merge', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  /** EE-followup: restaura un momento soft-deleted. Análogo a los
      restore de quotes/entities/relationships (V1). El deletedAt actúa
      como verificación: si fue restaurado/re-borrado por otro flujo
      desde que se obtuvo, el server responde 409. */
  async restoreMomento(id: string, deletedAt: string): Promise<Momento> {
    return request<Momento>('/api/momentos-restore', {
      method: 'POST',
      body: JSON.stringify({ id, deletedAt }),
    })
  },

  /** DD1: lista los storageKeys en el store global que NO están referenciados
      por ningún Momento en la BD actual. Útil para recuperar fotos subidas
      en deploy previews (cuyos Momentos quedaron en BDs ephemeral). */
  async listOrphanedBlobs(): Promise<{
    orphans: string[]
    totalInStore: number
    referenced: number
  }> {
    return request('/api/momentos-orphaned-blobs')
  },

  /** DD1: adopta un blob huérfano creando un Momento foto que lo apunte.
      origin queda marcada como 'imported' / 'orphaned-blob-rescue'. */
  async rescueOrphanedBlob(input: {
    storageKey: string
    note?: string
    capturedAt?: string
  }): Promise<Momento> {
    return request<Momento>('/api/momentos-orphaned-blobs', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  /** ξ3: sube un archivo de imagen a Netlify Blobs. Devuelve la storageKey
      que el cliente luego inserta en el payload del momento foto. */
  async momentoUpload(file: File): Promise<{
    storageKey: string
    mime: string
    size: number
  }> {
    const form = new FormData()
    form.append('file', file)
    // υ-bugfix: path movido de `/api/momentos/upload` a
    // `/api/momentos-upload` por el mismo conflicto con :id que causaba
    // 405 Method not allowed.
    const response = await fetch('/api/momentos-upload', {
      method: 'POST',
      body: form,
      headers: { 'X-AI-Mode': aiModeHeader() },
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`upload → ${response.status} ${text}`.trim())
    }
    return response.json()
  },
}
