import type {
  Entity,
  EntityType,
  ExportPayload,
  ExtractionProposal,
  Origin,
  Quote,
  Relationship,
  RelationshipType,
} from './types'

type EntityRow = {
  id: string
  type: string
  name: string
  year: number | null
  description: string | null
  position_x: number | null
  position_y: number | null
  origin: Origin | string
  created_at: string
  updated_at: string
}

type RelationshipRow = {
  id: string
  from_id: string
  to_id: string
  type: string
  notes: string | null
  origin: Origin | string
  created_at: string
  updated_at: string
}

type QuoteRow = {
  id: string
  entity_id: string
  text: string
  source: string | null
  context: string | null
  origin: Origin | string
  created_at: string
  updated_at: string
}

function asOrigin(value: Origin | string | null | undefined): Origin {
  if (value && typeof value === 'object' && 'kind' in value) return value
  if (typeof value === 'string') return { kind: value === 'ai' ? 'ai' : 'manual' }
  return { kind: 'manual' }
}

function entityFromRow(row: EntityRow): Entity {
  return {
    id: row.id,
    type: row.type as EntityType,
    name: row.name,
    year: row.year ?? undefined,
    description: row.description ?? undefined,
    positionX: row.position_x ?? undefined,
    positionY: row.position_y ?? undefined,
    origin: asOrigin(row.origin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function relationshipFromRow(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    type: row.type as RelationshipType,
    notes: row.notes ?? undefined,
    origin: asOrigin(row.origin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function quoteFromRow(row: QuoteRow): Quote {
  return {
    id: row.id,
    entityId: row.entity_id,
    text: row.text,
    source: row.source ?? undefined,
    context: row.context ?? undefined,
    origin: asOrigin(row.origin),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${response.status} ${text}`.trim())
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export const api = {
  async listEntities(): Promise<Entity[]> {
    const rows = await request<EntityRow[]>('/api/entities')
    return rows.map(entityFromRow)
  },
  async createEntity(data: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>): Promise<Entity> {
    const row = await request<EntityRow>('/api/entities', {
      method: 'POST',
      body: JSON.stringify({
        type: data.type,
        name: data.name,
        year: data.year ?? null,
        description: data.description ?? null,
        position_x: data.positionX ?? null,
        position_y: data.positionY ?? null,
        origin: data.origin,
      }),
    })
    return entityFromRow(row)
  },
  async updateEntityPosition(id: string, positionX: number, positionY: number): Promise<void> {
    await request<void>(`/api/entities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ position_x: positionX, position_y: positionY }),
    })
  },
  async updateEntityType(id: string, type: string): Promise<void> {
    await request<void>(`/api/entities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ type }),
    })
  },
  async deleteEntity(id: string): Promise<void> {
    await request<void>(`/api/entities/${id}`, { method: 'DELETE' })
  },

  async listRelationships(): Promise<Relationship[]> {
    const rows = await request<RelationshipRow[]>('/api/relationships')
    return rows.map(relationshipFromRow)
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
  async deleteRelationship(id: string): Promise<void> {
    await request<void>(`/api/relationships/${id}`, { method: 'DELETE' })
  },

  async listQuotes(): Promise<Quote[]> {
    const rows = await request<QuoteRow[]>('/api/quotes')
    return rows.map(quoteFromRow)
  },
  async createQuote(data: Omit<Quote, 'id' | 'createdAt' | 'updatedAt'>): Promise<Quote> {
    const row = await request<QuoteRow>('/api/quotes', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: data.entityId,
        text: data.text,
        source: data.source ?? null,
        context: data.context ?? null,
        origin: data.origin,
      }),
    })
    return quoteFromRow(row)
  },
  async deleteQuote(id: string): Promise<void> {
    await request<void>(`/api/quotes/${id}`, { method: 'DELETE' })
  },

  async extract(text: string): Promise<ExtractionProposal> {
    return request<ExtractionProposal>('/api/extract', {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
  },

  async suggestRelationships(): Promise<ExtractionProposal> {
    return request<ExtractionProposal>('/api/suggest-relationships', {
      method: 'POST',
      body: '{}',
    })
  },

  async reclassifyEntities(): Promise<ReclassifyResponse> {
    return request<ReclassifyResponse>('/api/reclassify-entities', {
      method: 'POST',
      body: '{}',
    })
  },

  // ---------- Chat ----------
  async listChatThreads(): Promise<ChatThread[]> {
    return request<ChatThread[]>('/api/chat/threads')
  },
  async createChatThread(title?: string): Promise<ChatThread> {
    return request<ChatThread>('/api/chat/threads', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    })
  },
  async deleteChatThread(id: string): Promise<void> {
    await request<void>(`/api/chat/threads/${id}`, { method: 'DELETE' })
  },
  async listChatMessages(threadId: string): Promise<ChatMessage[]> {
    return request<ChatMessage[]>(`/api/chat/threads/${threadId}/messages`)
  },
  async sendChatMessage(
    threadId: string,
    content: string,
  ): Promise<{ userMessage: ChatMessage; assistantMessage?: ChatMessage; error?: string }> {
    return request(`/api/chat/threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  },

  async exportAll(): Promise<ExportPayload> {
    return request<ExportPayload>('/api/export')
  },

  async importAll(payload: ExportPayload): Promise<{ imported: number }> {
    return request<{ imported: number }>('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async extractionLog(limit = 50): Promise<ExtractionLogResponse> {
    return request<ExtractionLogResponse>(`/api/extraction-log?limit=${limit}`)
  },

  async listEntityTypes(): Promise<Array<{ slug: string; label: string; sort_order: number }>> {
    return request('/api/entity-types')
  },
  async upsertEntityType(data: { slug: string; label: string; sort_order?: number }) {
    return request('/api/entity-types', { method: 'POST', body: JSON.stringify(data) })
  },
  async deleteEntityType(slug: string): Promise<void> {
    await request<void>(`/api/entity-types/${slug}`, { method: 'DELETE' })
  },

  async search(q: string): Promise<SearchResults> {
    if (!q.trim()) return { entities: [], quotes: [] }
    return request<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`)
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

  // ---------- Spotify ----------

  async spotifyStatus(): Promise<SpotifyStatus> {
    return request<SpotifyStatus>('/api/spotify/status')
  },
  async spotifySync(): Promise<{ fetched: number; inserted: number; mostRecentPlay: string | null }> {
    return request('/api/spotify/sync', { method: 'POST' })
  },
  async spotifyDisconnect(): Promise<void> {
    await request<void>('/api/spotify/status', { method: 'DELETE' })
  },
  async spotifyPlays(
    group: 'artist' | 'album' | 'track' = 'artist',
    limit = 50,
  ): Promise<SpotifyPlaysResponse> {
    return request<SpotifyPlaysResponse>(
      `/api/spotify/plays?group=${group}&limit=${limit}`,
    )
  },
}

export type SpotifyStatus =
  | { connected: false }
  | {
      connected: true
      spotifyUserId: string | null
      displayName: string | null
      connectedAt: string
      lastSyncedAt: string | null
      counts: {
        totalPlays: number
        uniqueTracks: number
        mostRecentPlay: string | null
      }
    }

export type SpotifyPlayGroup = {
  key: string
  plays: number
  firstPlayed: string
  lastPlayed: string
  existingEntityId: string | null
  spotifyId: string | null
}

export type SpotifyPlaysResponse = {
  group: 'artist' | 'album' | 'track'
  since: string
  items: SpotifyPlayGroup[]
}

export type ExtractionLogEntry = {
  id: string
  inputText: string
  proposal: unknown
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  costCents: number
  durationMs: number
  error: string | null
  createdAt: string
}

export type ExtractionLogResponse = {
  entries: ExtractionLogEntry[]
  totals: {
    totalCalls: number
    totalCostCents: number
    totalTokens: number
  }
}

export type SearchResults = {
  entities: Array<{ id: string; name: string; type: string; rank: number }>
  quotes: Array<{ id: string; entityId: string; text: string; rank: number }>
}

export type ChatThread = {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
  messageCount: number
}

export type ChatProposal = {
  entities?: Array<{
    type: string
    name: string
    year?: number
    description?: string
  }>
  relationships?: Array<{
    fromName: string
    toName: string
    type: string
    notes?: string
  }>
  quotes?: Array<{
    entityName: string
    text: string
    source?: string
  }>
  reclassifications?: Array<{
    name: string
    newType: string
    reason?: string
  }>
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  proposal: ChatProposal | null
  createdAt: string
}

export type Reclassification = {
  id: string
  name: string
  oldType: string
  newType: string
  reason?: string
}

export type ReclassifyResponse = {
  reclassifications: Reclassification[]
}
