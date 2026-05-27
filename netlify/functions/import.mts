import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { ImportBody } from './_lib/admin-schemas.js'
import { persistError, safeSql } from './_lib/observability.js'

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

/**
 * Item de falla en import. Antes los INSERT fallidos se silenciaban — un
 * import de 200 entidades con 5 fallos retornaba "imported: 150" sin pista
 * de los 5 perdidos. Ahora cada fallo se persiste en error_log y se
 * devuelve al cliente para que la UI pueda mostrar exactamente qué falló.
 */
type FailedItem = {
  kind: 'entity' | 'relationship' | 'quote'
  id: string | null
  reason: string
}

export default withObservability('import', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  const { id: userId } = await getAuthedUser(req)
  const sql = getSql()

  const parsed = await parseJsonBody(req, ImportBody, requestId)
  if (!parsed.ok) return parsed.response
  // Cast después de validación de Zod — el ImportBody pasa los items
  // como unknown[], el handler los procesa con error recovery por item.
  const payload = parsed.data as unknown as ImportPayload

  const entities = payload.entities ?? []
  const relationships = payload.relationships ?? []
  const quotes = payload.quotes ?? []

  let imported = 0
  let skipped = 0
  const failed: FailedItem[] = []

  // Try insert + persist failure on error. The loop never throws — every
  // item gets a chance, errors are collected. Avoids the previous behavior
  // where a single bad INSERT silently aborted everything after it.
  function recordFailure(kind: FailedItem['kind'], id: string | null, err: unknown): void {
    const reason = err instanceof Error ? err.message : String(err)
    failed.push({ kind, id, reason })
    persistError(safeSql(), {
      functionName: 'import',
      httpMethod: 'POST',
      httpPath: '/api/import',
      statusCode: 200, // request itself succeeded; per-item failure
      message: `import ${kind} failed: ${reason}`,
      context: { kind, id },
    })
  }

  for (const e of entities) {
    if (!e.id || !e.type || !e.name) {
      skipped++
      continue
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(e.origin))
      const result = await sql`
        INSERT INTO entities (id, type, name, year, description, position_x, position_y, origin, user_id)
        VALUES (
          ${e.id},
          ${e.type},
          ${e.name},
          ${e.year ?? null},
          ${e.description ?? null},
          ${e.positionX ?? null},
          ${e.positionY ?? null},
          ${origin}::jsonb,
          ${userId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `
      if (result.length > 0) imported++
      else skipped++ // duplicate id
    } catch (err) {
      recordFailure('entity', e.id ?? null, err)
    }
  }

  for (const r of relationships) {
    if (!r.id || !r.fromId || !r.toId || !r.type) {
      skipped++
      continue
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(r.origin))
      const result = await sql`
        INSERT INTO relationships (id, from_id, to_id, type, notes, origin, user_id)
        VALUES (
          ${r.id},
          ${r.fromId},
          ${r.toId},
          ${r.type},
          ${r.notes ?? null},
          ${origin}::jsonb,
          ${userId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `
      if (result.length > 0) imported++
      else skipped++
    } catch (err) {
      recordFailure('relationship', r.id ?? null, err)
    }
  }

  for (const q of quotes) {
    if (!q.id || !q.entityId || !q.text) {
      skipped++
      continue
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(q.origin))
      const result = await sql`
        INSERT INTO quotes (id, entity_id, text, source, context, origin, user_id)
        VALUES (
          ${q.id},
          ${q.entityId},
          ${q.text},
          ${q.source ?? null},
          ${q.context ?? null},
          ${origin}::jsonb,
          ${userId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `
      if (result.length > 0) imported++
      else skipped++
    } catch (err) {
      recordFailure('quote', q.id ?? null, err)
    }
  }

  return Response.json({
    imported,
    skipped,
    failed,
    // Retro-compat: clientes viejos sólo leen `imported`.
  })
})

export const config: Config = {
  path: '/api/import',
}
