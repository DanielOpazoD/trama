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

/**
 * Read the current AI mode synchronously and convert to its header form.
 * Kept inline (no import of useAIMode) so this module stays React-free.
 */
function aiModeHeader(): string {
  if (typeof window === 'undefined') return 'auto'
  const raw = window.localStorage.getItem('trama.aiMode') ?? 'auto'
  if (raw === 'off' || raw === 'auto') return raw
  if (raw.startsWith('forced-')) return `forced:${raw.slice('forced-'.length)}`
  return 'auto'
}

/**
 * Thrown when /api/entities POST refuses with HTTP 409 because the new entity
 * looks like a near-duplicate of an existing one. Carries the candidates the
 * UI can present ("did you mean…?").
 */
export class DuplicateEntityError extends Error {
  suggestions: Array<{
    id: string
    name: string
    type: string
    description: string | null
    similarity: number
  }>
  constructor(suggestions: DuplicateEntityError['suggestions']) {
    super('Posible entidad duplicada')
    this.name = 'DuplicateEntityError'
    this.suggestions = suggestions
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-AI-Mode': aiModeHeader(),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    // 423 = AI is disabled by the user. Surface the server's message verbatim
    // so the UI can show something meaningful instead of "HTTP 423".
    if (response.status === 423) {
      throw new Error(text || 'IA deshabilitada por el usuario (modo Off).')
    }
    // 409 on /api/entities → dup detection. Parse and throw a typed error.
    if (response.status === 409 && url.startsWith('/api/entities')) {
      try {
        const body = JSON.parse(text) as {
          error?: string
          suggestions?: DuplicateEntityError['suggestions']
        }
        if (body.error === 'possible_duplicate' && Array.isArray(body.suggestions)) {
          throw new DuplicateEntityError(body.suggestions)
        }
      } catch (parseErr) {
        if (parseErr instanceof DuplicateEntityError) throw parseErr
        // fall through to generic error if body wasn't the expected shape
      }
    }
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${response.status} ${text}`.trim())
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

export const api = {
  async listEntitiesPage(
    limit: number,
    cursor: string | null,
  ): Promise<{ items: Entity[]; nextCursor: string | null }> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    const res = await request<{ items: EntityRow[]; nextCursor: string | null }>(
      `/api/entities?${params.toString()}`,
    )
    return {
      items: res.items.map(entityFromRow),
      nextCursor: res.nextCursor,
    }
  },
  async listEntities(): Promise<Entity[]> {
    const rows = await request<EntityRow[]>('/api/entities')
    return rows.map(entityFromRow)
  },
  async createEntity(
    data: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'>,
    options?: { force?: boolean },
  ): Promise<Entity> {
    const url = options?.force ? '/api/entities?force=true' : '/api/entities'
    const row = await request<EntityRow>(url, {
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
  async deleteEntity(id: string): Promise<{ deletedAt: string }> {
    return request<{ deletedAt: string }>(`/api/entities/${id}`, { method: 'DELETE' })
  },
  async restoreEntity(id: string, deletedAt: string): Promise<void> {
    await request<{ restored: boolean }>(`/api/entities/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ deletedAt }),
    })
  },

  async listRelationships(): Promise<Relationship[]> {
    const rows = await request<RelationshipRow[]>('/api/relationships')
    return rows.map(relationshipFromRow)
  },
  async listRelationshipsPage(
    limit: number,
    cursor: string | null,
  ): Promise<{ items: Relationship[]; nextCursor: string | null }> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    const res = await request<{ items: RelationshipRow[]; nextCursor: string | null }>(
      `/api/relationships?${params.toString()}`,
    )
    return {
      items: res.items.map(relationshipFromRow),
      nextCursor: res.nextCursor,
    }
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
  async updateRelationship(
    id: string,
    patch: Partial<{ type: string; notes: string | null }>,
  ): Promise<Relationship> {
    const body: Record<string, unknown> = {}
    if (patch.type !== undefined) body.type = patch.type
    if (patch.notes !== undefined) body.notes = patch.notes
    const row = await request<RelationshipRow>(`/api/relationships/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return relationshipFromRow(row)
  },
  async deleteRelationship(id: string): Promise<{ deletedAt: string }> {
    return request<{ deletedAt: string }>(`/api/relationships/${id}`, { method: 'DELETE' })
  },
  async restoreRelationship(id: string, deletedAt: string): Promise<void> {
    await request<{ restored: boolean }>(`/api/relationships/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ deletedAt }),
    })
  },

  async listQuotes(): Promise<Quote[]> {
    const rows = await request<QuoteRow[]>('/api/quotes')
    return rows.map(quoteFromRow)
  },
  async getCounts(): Promise<{ entities: number; quotes: number; relationships: number }> {
    return request('/api/counts')
  },
  async getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>('/api/health')
  },

  // Lookup helpers: usar estos en vez de cargar la lista completa de
  // entidades y filtrarla en memoria. A 100k es lo único viable.
  async lookupEntityByName(name: string): Promise<Entity[]> {
    if (!name.trim()) return []
    const rows = await request<EntityRow[]>(
      `/api/entities-lookup?name=${encodeURIComponent(name)}`,
    )
    return rows.map(entityFromRow)
  },
  async lookupEntitiesByPrefix(prefix: string): Promise<Entity[]> {
    if (!prefix.trim()) return []
    const rows = await request<EntityRow[]>(
      `/api/entities-lookup?prefix=${encodeURIComponent(prefix)}`,
    )
    return rows.map(entityFromRow)
  },
  async getEntitiesByIds(ids: string[]): Promise<Entity[]> {
    if (ids.length === 0) return []
    const rows = await request<EntityRow[]>(
      `/api/entities-lookup?ids=${ids.map(encodeURIComponent).join(',')}`,
    )
    return rows.map(entityFromRow)
  },

  // Subgrafo de vecinos: úselo en vez de "cargar todo el grafo". GraphView
  // se refactorizará para consumir esto progresivamente.
  async getNeighbors(
    fromId: string,
    options?: { hops?: number; limit?: number },
  ): Promise<NeighborsResponse> {
    const params = new URLSearchParams({ from: fromId })
    if (options?.hops) params.set('hops', String(options.hops))
    if (options?.limit) params.set('limit', String(options.limit))
    return request<NeighborsResponse>(`/api/graph/neighbors?${params.toString()}`)
  },
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
      entityId: string
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
    if (patch.entityId !== undefined) body.entity_id = patch.entityId
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
  async deleteQuote(id: string): Promise<{ deletedAt: string }> {
    return request<{ deletedAt: string }>(`/api/quotes/${id}`, { method: 'DELETE' })
  },
  async restoreQuote(id: string, deletedAt: string): Promise<void> {
    await request<{ restored: boolean }>(`/api/quotes/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ deletedAt }),
    })
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
  async createChatThread(
    titleOrOpts?: string | { title?: string; context?: string },
  ): Promise<ChatThread> {
    const body =
      typeof titleOrOpts === 'string'
        ? { title: titleOrOpts }
        : titleOrOpts ?? {}
    return request<ChatThread>('/api/chat/threads', {
      method: 'POST',
      body: JSON.stringify(body),
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
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Mode': aiModeHeader(),
      },
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

  async errorLog(limit = 100): Promise<ErrorLogEntry[]> {
    return request<ErrorLogEntry[]>(`/api/error-log?limit=${limit}`)
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
  /** κ-spotify: snapshot agregado de la paleta musical (top géneros, décadas,
      saved count, párrafo IA). El servidor lo devuelve fresco; el cliente lo
      cachea en localStorage para no re-generar cada vez. */
  async spotifyLibrarySnapshot(): Promise<SpotifyLibrarySnapshot> {
    return request<SpotifyLibrarySnapshot>('/api/spotify/library-snapshot', {
      method: 'POST',
      body: '{}',
    })
  },
}

export type SpotifyLibrarySnapshot = {
  savedCount: number
  topGenres: Array<{ name: string; weight: number }>
  topArtists: Array<{ name: string; popularity: number; genres: string[] }>
  topTracks: Array<{ name: string; artists: string[]; year: number | null }>
  decades: Array<{ decade: string; count: number }>
  aiSummary: string | null
  provider: string | null
  model: string | null
  aiError?: string
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

export type ErrorLogEntry = {
  id: string
  functionName: string
  httpMethod: string | null
  httpPath: string | null
  statusCode: number | null
  message: string
  stack: string | null
  context: unknown
  createdAt: string
}

export type ChatThread = {
  id: string
  title: string | null
  /** Section that spawned the thread (e.g., 'citas', 'entidades'). null = free chat. */
  context: string | null
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
  /** Inline edits to existing rows. id is the existing row's UUID. */
  edits?: Array<{
    kind: 'entity' | 'quote' | 'relationship'
    id: string
    /** Loose: components introspect what's present. */
    patch: Record<string, unknown>
    reason?: string
    /** For display: name (entity), preview (quote/rel). */
    name?: string
    preview?: string
    entityName?: string
  }>
  /** Soft-delete proposals. UI shows these unchecked by default. */
  deletes?: Array<{
    kind: 'entity' | 'quote' | 'relationship'
    id: string
    preview: string
    reason?: string
  }>
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  proposal: ChatProposal | null
  createdAt: string
  /** Which model produced this assistant message — undefined for user messages. */
  provider?: string
  model?: string
}

export type HealthAlert = {
  severity: 'info' | 'warn' | 'error'
  code: string
  label: string
  hint: string
}

export type HealthResponse = {
  counts: { entities: number; quotes: number; relationships: number }
  month: {
    calls: number
    tokensIn: number
    tokensOut: number
    costCents: number
  }
  budget: {
    limitCents: number
    remainingCents: number
    pct: number
  }
  byProvider: Array<{
    provider: string
    model: string
    calls: number
    costCents: number
  }>
  recentErrors: Array<{
    id: string
    functionName: string
    httpMethod: string | null
    httpPath: string | null
    statusCode: number | null
    message: string
    createdAt: string
  }>
  alerts: HealthAlert[]
  embeddings: {
    pendingEntities: number
    pendingQuotes: number
  }
  /** Serie diaria de los últimos 30 días para sparklines. Días sin
      actividad aparecen con costCents=0, calls=0. */
  dailyCost: Array<{
    day: string
    costCents: number
    calls: number
  }>
}

export type NeighborWithHop = Entity & { hopDistance: number }

export type NeighborsResponse = {
  from: NeighborWithHop
  entities: NeighborWithHop[]
  relationships: Relationship[]
  hops: number
  limit: number
  truncated: boolean
}

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

export type AskResponse = {
  reply: string
  proposal: ExtractionProposal | null
  provider: string
  model: string
  /** Section thread id — present whenever a view was sent (so future turns can chain). */
  threadId: string | null
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
