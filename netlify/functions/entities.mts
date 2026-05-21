import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'

type Origin = { kind: string; [key: string]: unknown }

function normalizeOrigin(value: unknown): Origin {
  if (value && typeof value === 'object' && 'kind' in (value as Record<string, unknown>)) {
    return value as Origin
  }
  if (typeof value === 'string') {
    return { kind: value === 'ai' ? 'ai' : 'manual' }
  }
  return { kind: 'manual' }
}

export default withObservability('entities', async (req: Request, context: Context) => {
  const sql = getSql()
  const id = context.params.id

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, type, name, year, description, position_x, position_y, origin, created_at, updated_at
      FROM entities
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `
    return Response.json(rows)
  }

  if (req.method === 'POST') {
    const body = (await req.json()) as {
      type: string
      name: string
      year?: number | null
      description?: string | null
      position_x?: number | null
      position_y?: number | null
      origin?: unknown
    }
    const origin = JSON.stringify(normalizeOrigin(body.origin))
    const rows = await sql`
      INSERT INTO entities (type, name, year, description, position_x, position_y, origin)
      VALUES (
        ${body.type},
        ${body.name},
        ${body.year ?? null},
        ${body.description ?? null},
        ${body.position_x ?? null},
        ${body.position_y ?? null},
        ${origin}::jsonb
      )
      RETURNING id, type, name, year, description, position_x, position_y, origin, created_at, updated_at
    `
    return Response.json(rows[0], { status: 201 })
  }

  if (req.method === 'PATCH' && id) {
    const body = (await req.json()) as {
      name?: string
      type?: string
      year?: number | null
      description?: string | null
      position_x?: number | null
      position_y?: number | null
    }
    // Only update fields that were actually sent. Postgres COALESCE pattern.
    const rows = await sql`
      UPDATE entities
      SET
        name        = COALESCE(${body.name ?? null}, name),
        type        = COALESCE(${body.type ?? null}, type),
        year        = CASE WHEN ${body.year !== undefined} THEN ${body.year ?? null} ELSE year END,
        description = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
        position_x  = CASE WHEN ${body.position_x !== undefined} THEN ${body.position_x ?? null} ELSE position_x END,
        position_y  = CASE WHEN ${body.position_y !== undefined} THEN ${body.position_y ?? null} ELSE position_y END
      WHERE id = ${id} AND deleted_at IS NULL
      RETURNING id, type, name, year, description, position_x, position_y, origin, created_at, updated_at
    `
    if (rows.length === 0) {
      return new Response('Entidad no encontrada', { status: 404 })
    }
    return Response.json(rows[0])
  }

  if (req.method === 'DELETE' && id) {
    // Soft delete: also cascade-soft-delete the entity's relationships and quotes.
    await sql`UPDATE entities SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`
    await sql`UPDATE relationships SET deleted_at = NOW() WHERE (from_id = ${id} OR to_id = ${id}) AND deleted_at IS NULL`
    await sql`UPDATE quotes SET deleted_at = NOW() WHERE entity_id = ${id} AND deleted_at IS NULL`
    return new Response(null, { status: 204 })
  }

  return new Response('Method not allowed', { status: 405 })
})

export const config: Config = {
  path: ['/api/entities', '/api/entities/:id'],
}
