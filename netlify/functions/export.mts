import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'

export default async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const sql = getSql()

  type EntityRow = {
    id: string
    type: string
    name: string
    year: number | null
    description: string | null
    position_x: number | null
    position_y: number | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  type RelationshipRow = {
    id: string
    from_id: string
    to_id: string
    type: string
    notes: string | null
    origin: unknown
    created_at: string
    updated_at: string
  }
  type QuoteRow = {
    id: string
    entity_id: string
    text: string
    source: string | null
    context: string | null
    origin: unknown
    created_at: string
    updated_at: string
  }

  const [entities, relationships, quotes] = await Promise.all([
    sql`SELECT id, type, name, year, description, position_x, position_y, origin, created_at, updated_at
        FROM entities WHERE deleted_at IS NULL ORDER BY created_at` as unknown as Promise<EntityRow[]>,
    sql`SELECT id, from_id, to_id, type, notes, origin, created_at, updated_at
        FROM relationships WHERE deleted_at IS NULL ORDER BY created_at` as unknown as Promise<RelationshipRow[]>,
    sql`SELECT id, entity_id, text, source, context, origin, created_at, updated_at
        FROM quotes WHERE deleted_at IS NULL ORDER BY created_at` as unknown as Promise<QuoteRow[]>,
  ])

  const payload = {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    entities: entities.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      year: row.year ?? undefined,
      description: row.description ?? undefined,
      positionX: row.position_x ?? undefined,
      positionY: row.position_y ?? undefined,
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    relationships: relationships.map((row) => ({
      id: row.id,
      fromId: row.from_id,
      toId: row.to_id,
      type: row.type,
      notes: row.notes ?? undefined,
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    quotes: quotes.map((row) => ({
      id: row.id,
      entityId: row.entity_id,
      text: row.text,
      source: row.source ?? undefined,
      context: row.context ?? undefined,
      origin: row.origin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  }

  return Response.json(payload, {
    headers: {
      'Content-Disposition': `attachment; filename="trama-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  })
}

export const config: Config = {
  path: '/api/export',
}
