import type {
  Entity,
  EntityType,
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
  origin: string
  created_at: string
}

type RelationshipRow = {
  id: string
  from_id: string
  to_id: string
  type: string
  notes: string | null
  origin: string
  created_at: string
}

type QuoteRow = {
  id: string
  entity_id: string
  text: string
  source: string | null
  context: string | null
  origin: string
  created_at: string
}

function asOrigin(value: string): Origin {
  return value === 'ai' ? 'ai' : 'manual'
}

function entityFromRow(row: EntityRow): Entity {
  return {
    id: row.id,
    type: row.type as EntityType,
    name: row.name,
    year: row.year ?? undefined,
    description: row.description ?? undefined,
    origin: asOrigin(row.origin),
    createdAt: row.created_at,
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
  async createEntity(data: Omit<Entity, 'id' | 'createdAt'>): Promise<Entity> {
    const row = await request<EntityRow>('/api/entities', {
      method: 'POST',
      body: JSON.stringify({
        type: data.type,
        name: data.name,
        year: data.year ?? null,
        description: data.description ?? null,
        origin: data.origin,
      }),
    })
    return entityFromRow(row)
  },
  async deleteEntity(id: string): Promise<void> {
    await request<void>(`/api/entities/${id}`, { method: 'DELETE' })
  },

  async listRelationships(): Promise<Relationship[]> {
    const rows = await request<RelationshipRow[]>('/api/relationships')
    return rows.map(relationshipFromRow)
  },
  async createRelationship(
    data: Omit<Relationship, 'id' | 'createdAt'>,
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
  async createQuote(data: Omit<Quote, 'id' | 'createdAt'>): Promise<Quote> {
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
}
