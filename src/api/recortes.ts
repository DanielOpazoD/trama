/**
 * Recortes — cliente de la bandeja de capturas web. Transforma snake→camel
 * en la frontera (como el resto de src/api). La promoción registra en el
 * recorte el objeto destino YA creado (el destino se crea con su endpoint
 * propio, reusando validaciones y optimistic updates existentes).
 */
import { request } from './request'

export type RecorteStatus = 'pending' | 'promoted' | 'archived'
export type RecorteTarget = 'quote' | 'entity' | 'momento'

/** Sugerencia de curaduría de la IA para un recorte (advisory). */
export type RecorteSuggestion = {
  target: RecorteTarget
  title: string
  rationale: string
  relatedEntityIds: string[]
  suggestedEntityName: string | null
  suggestedEntityType: string | null
  relatedEntities: { id: string; name: string; type: string }[]
}

export type Recorte = {
  id: string
  text: string
  sourceUrl: string | null
  sourceTitle: string | null
  sourceAuthor: string | null
  note: string | null
  imageUrl: string | null
  status: RecorteStatus
  promotedTarget: RecorteTarget | null
  promotedId: string | null
  capturedAt: string | null
  createdAt: string
  updatedAt: string
}

export type RecorteRow = {
  id: string
  text: string
  source_url: string | null
  source_title: string | null
  source_author: string | null
  note: string | null
  image_url: string | null
  status: RecorteStatus
  promoted_target: RecorteTarget | null
  promoted_id: string | null
  captured_at: string | null
  created_at: string
  updated_at: string
}

export function recorteFromRow(r: RecorteRow): Recorte {
  return {
    id: r.id,
    text: r.text,
    sourceUrl: r.source_url,
    sourceTitle: r.source_title,
    sourceAuthor: r.source_author,
    note: r.note,
    imageUrl: r.image_url,
    status: r.status,
    promotedTarget: r.promoted_target,
    promotedId: r.promoted_id,
    capturedAt: r.captured_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export type ApiToken = {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
  /** SOLO presente en la respuesta del create — única vez que viaja. */
  token?: string
}

type ApiTokenRow = {
  id: string
  label: string
  created_at: string
  last_used_at: string | null
  token?: string
}

function tokenFromRow(r: ApiTokenRow): ApiToken {
  return {
    id: r.id,
    label: r.label,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    ...(r.token ? { token: r.token } : {}),
  }
}

export const recortesApi = {
  async listRecortes(status?: RecorteStatus): Promise<Recorte[]> {
    const qs = status ? `?status=${status}` : ''
    const rows = await request<RecorteRow[]>(`/api/recortes${qs}`)
    return rows.map(recorteFromRow)
  },
  async createRecorte(input: {
    text: string
    sourceUrl?: string | null
    sourceTitle?: string | null
    note?: string | null
  }): Promise<Recorte> {
    const row = await request<RecorteRow>('/api/recortes', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return recorteFromRow(row)
  },
  async updateRecorte(
    id: string,
    patch: { text?: string; note?: string | null; status?: 'pending' | 'archived' },
  ): Promise<Recorte> {
    const row = await request<RecorteRow>(`/api/recortes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return recorteFromRow(row)
  },
  async removeRecorte(id: string): Promise<{ deletedAt: string | null }> {
    const res = await request<{ ok: boolean; deletedAt?: string | null }>(
      `/api/recortes/${id}`,
      { method: 'DELETE' },
    )
    return { deletedAt: res.deletedAt ?? null }
  },
  async restoreRecorte(id: string, deletedAt: string): Promise<void> {
    await request<{ restored: boolean }>(`/api/recortes/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ deletedAt }),
    })
  },
  /** Marca el recorte como promovido al objeto YA creado. */
  async promoteRecorte(
    id: string,
    target: RecorteTarget,
    promotedId: string,
  ): Promise<Recorte> {
    const row = await request<RecorteRow>(`/api/recortes/${id}/promote`, {
      method: 'POST',
      body: JSON.stringify({ target, promotedId }),
    })
    return recorteFromRow(row)
  },
  /** Pide a la IA una sugerencia de curaduría (no muta el recorte). */
  async suggestRecorte(id: string): Promise<RecorteSuggestion> {
    return request<RecorteSuggestion>(`/api/recortes/${id}/suggest`, { method: 'POST' })
  },

  async listApiTokens(): Promise<ApiToken[]> {
    const rows = await request<ApiTokenRow[]>('/api/api-tokens')
    return rows.map(tokenFromRow)
  },
  async createApiToken(label?: string): Promise<ApiToken> {
    const row = await request<ApiTokenRow>('/api/api-tokens', {
      method: 'POST',
      body: JSON.stringify({ label: label ?? 'extensión de Chrome' }),
    })
    return tokenFromRow(row)
  },
  async revokeApiToken(id: string): Promise<void> {
    await request<{ ok: boolean }>(`/api/api-tokens/${id}`, { method: 'DELETE' })
  },
}
