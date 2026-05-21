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
  essay: string | null
  position_x: number | null
  position_y: number | null
  origin: Origin | string
  spotify_url: string | null
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
  user_reflection?: string | null
  ai_reflection?: string | null
  ai_reflection_provider?: string | null
  ai_reflection_model?: string | null
  ai_reflection_at?: string | null
  linked_quote_ids?: string[] | null
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
    essay: row.essay ?? undefined,
    positionX: row.position_x ?? undefined,
    positionY: row.position_y ?? undefined,
    origin: asOrigin(row.origin),
    spotifyUrl: row.spotify_url ?? undefined,
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
    userReflection: row.user_reflection ?? undefined,
    aiReflection: row.ai_reflection ?? undefined,
    aiReflectionProvider: row.ai_reflection_provider ?? undefined,
    aiReflectionModel: row.ai_reflection_model ?? undefined,
    aiReflectionAt: row.ai_reflection_at ?? undefined,
    linkedQuoteIds: Array.isArray(row.linked_quote_ids) ? row.linked_quote_ids : [],
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
        spotify_url: data.spotifyUrl ?? null,
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
  async updateEntity(
    id: string,
    patch: Partial<{
      name: string
      type: string
      year: number | null
      description: string | null
      essay: string | null
      spotifyUrl: string | null
    }>,
  ): Promise<Entity> {
    const body: Record<string, unknown> = {}
    if (patch.name !== undefined) body.name = patch.name
    if (patch.type !== undefined) body.type = patch.type
    if (patch.year !== undefined) body.year = patch.year
    if (patch.description !== undefined) body.description = patch.description
    if (patch.essay !== undefined) body.essay = patch.essay
    if (patch.spotifyUrl !== undefined) body.spotify_url = patch.spotifyUrl
    const row = await request<EntityRow>(`/api/entities/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return entityFromRow(row)
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
  async createQuote(data: Omit<Quote, 'id' | 'createdAt' | 'updatedAt' | 'linkedQuoteIds'> & {
    linkedQuoteIds?: string[]
  }): Promise<Quote> {
    const row = await request<QuoteRow>('/api/quotes', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: data.entityId,
        text: data.text,
        source: data.source ?? null,
        context: data.context ?? null,
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
      userReflection: string | null
      aiReflection: string | null
      aiReflectionProvider: string | null
      aiReflectionModel: string | null
      linkedQuoteIds: string[]
    }>,
  ): Promise<Quote> {
    const body: Record<string, unknown> = {}
    if (patch.text !== undefined) body.text = patch.text
    if (patch.source !== undefined) body.source = patch.source
    if (patch.context !== undefined) body.context = patch.context
    if (patch.userReflection !== undefined) body.user_reflection = patch.userReflection
    if (patch.aiReflection !== undefined) body.ai_reflection = patch.aiReflection
    if (patch.aiReflectionProvider !== undefined) body.ai_reflection_provider = patch.aiReflectionProvider
    if (patch.aiReflectionModel !== undefined) body.ai_reflection_model = patch.aiReflectionModel
    if (patch.linkedQuoteIds !== undefined) body.linked_quote_ids = patch.linkedQuoteIds
    const row = await request<QuoteRow>(`/api/quotes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return quoteFromRow(row)
  },
  async reflectQuote(id: string): Promise<{ reflection: string; provider: string; model: string }> {
    return request(`/api/quotes/${id}/reflect`, { method: 'POST', body: '{}' })
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

  async extractFromImage(imageBase64: string, mimeType: string): Promise<ExtractionProposal> {
    return request<ExtractionProposal>('/api/extract-from-image', {
      method: 'POST',
      body: JSON.stringify({ imageBase64, mimeType }),
    })
  },

  async suggestRelationships(): Promise<ExtractionProposal> {
    return request<ExtractionProposal>('/api/suggest-relationships', {
      method: 'POST',
      body: '{}',
    })
  },

  async importSpotifyPlaylist(input: string): Promise<SpotifyPlaylistImport> {
    return request<SpotifyPlaylistImport>('/api/spotify/import-playlist', {
      method: 'POST',
      body: JSON.stringify({ url: input }),
    })
  },

  async getAISettings(): Promise<AISettingsResponse> {
    return request<AISettingsResponse>('/api/ai-settings')
  },
  async setAITaskProvider(
    task: string,
    provider: string,
    model?: string | null,
    verifyWith?: string | null,
  ): Promise<void> {
    await request<void>('/api/ai-settings', {
      method: 'PUT',
      body: JSON.stringify({ task, provider, model, verifyWith }),
    })
  },

  async listProactiveSuggestions(
    status: 'pending' | 'applied' | 'dismissed' = 'pending',
  ): Promise<ProactiveSuggestion[]> {
    return request<ProactiveSuggestion[]>(`/api/proactive-suggestions?status=${status}`)
  },
  async generateProactiveSuggestions(): Promise<{ inserted: number; suggestions: ProactiveSuggestion[] }> {
    return request('/api/proactive-suggestions', { method: 'POST', body: '{}' })
  },
  async resolveProactiveSuggestion(id: string, status: 'applied' | 'dismissed'): Promise<void> {
    await request<void>(`/api/proactive-suggestions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
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
  async streamChatMessage(
    threadId: string,
    content: string,
    handlers: {
      onUser?: (msg: ChatMessage) => void
      onChunk?: (text: string) => void
      onDone?: (msg: ChatMessage) => void
      onError?: (message: string) => void
    },
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`/api/chat/threads/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal,
    })
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '')
      handlers.onError?.(text || `HTTP ${response.status}`)
      return
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sepIdx: number
      while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sepIdx)
        buffer = buffer.slice(sepIdx + 2)
        let event = 'message'
        const dataLines: string[] = []
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (dataLines.length === 0) continue
        let parsed: unknown
        try {
          parsed = JSON.parse(dataLines.join('\n'))
        } catch {
          continue
        }
        if (event === 'user') handlers.onUser?.(parsed as ChatMessage)
        else if (event === 'chunk') {
          const c = (parsed as { content?: string }).content ?? ''
          if (c) handlers.onChunk?.(c)
        } else if (event === 'done') {
          const msg = (parsed as { assistantMessage?: ChatMessage }).assistantMessage
          if (msg) handlers.onDone?.(msg)
        } else if (event === 'error') {
          handlers.onError?.((parsed as { message?: string }).message ?? 'unknown error')
        }
      }
    }
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
    spotifyUrl?: string
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

export type AITaskKey =
  | 'extract'
  | 'extract-image'
  | 'suggest-relationships'
  | 'reclassify'
  | 'reflect'
  | 'chat'
  | 'panel'

export type AITaskConfig = {
  task: AITaskKey
  /** null = use default (env var) */
  provider: string | null
  /** null = use provider's default model */
  model: string | null
  /** null = no cross-verification */
  verifyWith: string | null
  updatedAt: string | null
}

export type AISettingsResponse = {
  defaultProvider: string
  visionDefaultProvider: string | null
  tasks: AITaskConfig[]
}

export type SpotifyPlaylistImport = {
  playlist: {
    id: string
    name: string
    description: string
    ownerName: string
    totalTracks: number
  }
  proposal: {
    entities: Array<{
      type: string
      name: string
      year?: number
      description?: string
      spotifyUrl?: string
    }>
    relationships: Array<{
      fromName: string
      toName: string
      type: string
      notes?: string
    }>
    quotes: Array<{
      entityName: string
      text: string
      source?: string
    }>
  }
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
}
