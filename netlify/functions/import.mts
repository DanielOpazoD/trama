import { neon } from '@neondatabase/serverless'
import type { Config } from '@netlify/functions'

type IncomingEntity = {
  id?: string
  type: string
  name: string
  year?: number | null
  description?: string | null
  positionX?: number | null
  positionY?: number | null
  origin?: unknown
}
type IncomingRelationship = {
  id?: string
  fromId: string
  toId: string
  type: string
  notes?: string | null
  origin?: unknown
}
type IncomingQuote = {
  id?: string
  entityId: string
  text: string
  source?: string | null
  context?: string | null
  origin?: unknown
}
type ImportPayload = {
  version: number
  entities?: IncomingEntity[]
  relationships?: IncomingRelationship[]
  quotes?: IncomingQuote[]
}

function normalizeOrigin(value: unknown): { kind: string; [k: string]: unknown } {
  if (value && typeof value === 'object' && 'kind' in (value as Record<string, unknown>)) {
    return value as { kind: string; [k: string]: unknown }
  }
  if (typeof value === 'string') {
    return { kind: value === 'ai' ? 'ai' : 'manual' }
  }
  return { kind: 'manual' }
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const connectionString = Netlify.env.get('NETLIFY_DATABASE_URL')
  if (!connectionString) {
    return new Response('NETLIFY_DATABASE_URL no está configurada', { status: 500 })
  }
  const sql = neon(connectionString)

  let payload: ImportPayload
  try {
    payload = (await req.json()) as ImportPayload
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }
  if (!payload || payload.version !== 1) {
    return new Response('Versión de export no soportada (esperado: 1)', { status: 400 })
  }

  const entities = payload.entities ?? []
  const relationships = payload.relationships ?? []
  const quotes = payload.quotes ?? []

  let imported = 0

  // Insert entities. ON CONFLICT (id) DO NOTHING means existing ids are skipped.
  for (const e of entities) {
    if (!e.id || !e.type || !e.name) continue
    const origin = JSON.stringify(normalizeOrigin(e.origin))
    const result = await sql`
      INSERT INTO entities (id, type, name, year, description, position_x, position_y, origin)
      VALUES (
        ${e.id},
        ${e.type},
        ${e.name},
        ${e.year ?? null},
        ${e.description ?? null},
        ${e.positionX ?? null},
        ${e.positionY ?? null},
        ${origin}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `
    if (result.length > 0) imported++
  }

  for (const r of relationships) {
    if (!r.id || !r.fromId || !r.toId || !r.type) continue
    const origin = JSON.stringify(normalizeOrigin(r.origin))
    const result = await sql`
      INSERT INTO relationships (id, from_id, to_id, type, notes, origin)
      VALUES (
        ${r.id},
        ${r.fromId},
        ${r.toId},
        ${r.type},
        ${r.notes ?? null},
        ${origin}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `
    if (result.length > 0) imported++
  }

  for (const q of quotes) {
    if (!q.id || !q.entityId || !q.text) continue
    const origin = JSON.stringify(normalizeOrigin(q.origin))
    const result = await sql`
      INSERT INTO quotes (id, entity_id, text, source, context, origin)
      VALUES (
        ${q.id},
        ${q.entityId},
        ${q.text},
        ${q.source ?? null},
        ${q.context ?? null},
        ${origin}::jsonb
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `
    if (result.length > 0) imported++
  }

  return Response.json({ imported })
}

export const config: Config = {
  path: '/api/import',
}
