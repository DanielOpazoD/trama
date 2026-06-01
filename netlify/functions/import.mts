import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { resolveImportId } from './_lib/import-ids.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { ImportBody } from './_lib/admin-schemas.js'
import { persistError, safeSql } from './_lib/observability.js'
import { LEGACY_PARTIAL_EXPORT_SCOPE } from './_lib/export-scope.js'

type IncomingEntity = {
  id: string
  type: string
  name: string
  year?: number | null
  description?: string | null
  positionX?: number | null
  positionY?: number | null
  origin?: unknown
}
type IncomingRelationship = {
  id: string
  fromId: string
  toId: string
  type: string
  notes?: string | null
  origin?: unknown
}
type IncomingQuote = {
  id: string
  entityId: string
  text: string
  source?: string | null
  context?: string | null
  link?: string | null
  origin?: unknown
}

import { normalizeOrigin } from './_lib/origin.js'

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function incomingEntity(value: unknown): IncomingEntity | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const type = stringValue(item.type)
  const name = stringValue(item.name)
  if (!id || !type || !name) return null
  return {
    id,
    type,
    name,
    year: nullableNumber(item.year),
    description: nullableString(item.description),
    positionX: nullableNumber(item.positionX),
    positionY: nullableNumber(item.positionY),
    origin: item.origin,
  }
}

function incomingRelationship(value: unknown): IncomingRelationship | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const fromId = stringValue(item.fromId)
  const toId = stringValue(item.toId)
  const type = stringValue(item.type)
  if (!id || !fromId || !toId || !type) return null
  return {
    id,
    fromId,
    toId,
    type,
    notes: nullableString(item.notes),
    origin: item.origin,
  }
}

function incomingQuote(value: unknown): IncomingQuote | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const entityId = stringValue(item.entityId)
  const text = stringValue(item.text)
  if (!id || !entityId || !text) return null
  return {
    id,
    entityId,
    text,
    source: nullableString(item.source),
    context: nullableString(item.context),
    link: nullableString(item.link),
    origin: item.origin,
  }
}

export default withObservability('import', async (req: Request, _ctx, { requestId }) => {
  if (req.method !== 'POST') {
    return ApiErrors.methodNotAllowed(requestId)
  }
  const authedUser = await getAuthedUser(req)
  const userId = authedUser.id
  const sql = getSql()
  await ensureUserRow(sql, authedUser)

  const parsed = await parseJsonBody(req, ImportBody, requestId)
  if (!parsed.ok) return parsed.response
  const payload = parsed.data

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
      userId,
    })
  }

  for (const rawEntity of entities) {
    const e = incomingEntity(rawEntity)
    if (!e) {
      skipped++
      continue
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(e.origin))
      const result = await sqlTyped<{ id: string }>(sql`
        INSERT INTO entities (id, type, name, year, description, position_x, position_y, origin, user_id)
        VALUES (
          ${resolveImportId(e.id, userId)},
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
      `)
      if (result.length > 0) imported++
      else skipped++ // duplicate id
    } catch (err) {
      recordFailure('entity', e.id ?? null, err)
    }
  }

  for (const rawRelationship of relationships) {
    const r = incomingRelationship(rawRelationship)
    if (!r) {
      skipped++
      continue
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(r.origin))
      const result = await sqlTyped<{ id: string }>(sql`
        INSERT INTO relationships (id, from_id, to_id, type, notes, origin, user_id)
        VALUES (
          ${resolveImportId(r.id, userId)},
          ${resolveImportId(r.fromId, userId)},
          ${resolveImportId(r.toId, userId)},
          ${r.type},
          ${r.notes ?? null},
          ${origin}::jsonb,
          ${userId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `)
      if (result.length > 0) imported++
      else skipped++
    } catch (err) {
      recordFailure('relationship', r.id ?? null, err)
    }
  }

  for (const rawQuote of quotes) {
    const q = incomingQuote(rawQuote)
    if (!q) {
      skipped++
      continue
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(q.origin))
      const result = await sqlTyped<{ id: string }>(sql`
        INSERT INTO quotes (id, entity_id, text, source, context, link, origin, user_id)
        VALUES (
          ${resolveImportId(q.id, userId)},
          ${resolveImportId(q.entityId, userId)},
          ${q.text},
          ${q.source ?? null},
          ${q.context ?? null},
          ${q.link ?? null},
          ${origin}::jsonb,
          ${userId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `)
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
    scope: {
      label: 'Import parcial legado',
      ...LEGACY_PARTIAL_EXPORT_SCOPE,
    },
    // Retro-compat: clientes viejos sólo leen `imported`.
  })
})

export const config: Config = {
  path: '/api/import',
}
