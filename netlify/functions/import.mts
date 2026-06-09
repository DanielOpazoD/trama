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
import { STRUCTURED_CORE_EXPORT_SCOPE } from './_lib/export-scope.js'
import { VaultEnvelopeString } from './_lib/vault-envelope.js'
import { forEachConcurrent } from './_lib/concurrency.js'

// Tope de inserts en vuelo a la vez por fase. Cada insert es un round-trip HTTP
// a Neon; en serie, una importación grande (miles de filas) agota el timeout de
// la función. El pool acotado las paraleliza sin saturar la conexión. Las fases
// (entidades → relaciones → … ) siguen siendo secuenciales para respetar las FK.
const IMPORT_CONCURRENCY = 16

type IncomingEntity = {
  id: string
  type: string
  name: string
  year?: number | null
  description?: string | null
  essay?: string | null
  positionX?: number | null
  positionY?: number | null
  spotifyUrl?: string | null
  wikipediaUrl?: string | null
  grokipediaUrl?: string | null
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
  userReflection?: string | null
  aiReflection?: string | null
  aiReflectionProvider?: string | null
  aiReflectionModel?: string | null
  aiReflectionAt?: string | null
  linkedQuoteIds?: string[]
  pinnedAt?: string | null
  resonance?: number | null
  link?: string | null
  origin?: unknown
}
type IncomingMomento = {
  id: string
  kind: string
  capturedAt?: string | null
  payload: Record<string, unknown>
  note?: string | null
  origin?: unknown
  entityIds: string[]
}
type IncomingNote = {
  id: string
  content: string
  tags: string[]
  pinned: boolean
  promotedMomentoId?: string | null
  origin?: unknown
}
type IncomingTask = {
  id: string
  title: string
  detail?: string | null
  done: boolean
  dueDate?: string | null
  priority?: string | null
  weekStart?: string | null
  completedAt?: string | null
  tags: string[]
  origin?: unknown
}
type IncomingPrompt = {
  id: string
  title: string
  content: string
  collection?: string | null
  tags: string[]
  variables: string[]
  favorite: boolean
  useCount: number
  origin?: unknown
}
type IncomingSecret = {
  id: string
  label: string
  encryptedSecret: string
  kind: string
  encryptedService?: string | null
  encryptedUsername?: string | null
  encryptedNotes?: string | null
  favorite: boolean
  critical: boolean
  expiresAt?: string | null
  lastRotatedAt?: string | null
  origin?: unknown
}

import { normalizeOrigin } from './_lib/origin.js'

/**
 * Item de falla en import. Antes los INSERT fallidos se silenciaban — un
 * import de 200 entidades con 5 fallos retornaba "imported: 150" sin pista
 * de los 5 perdidos. Ahora cada fallo se persiste en error_log y se
 * devuelve al cliente para que la UI pueda mostrar exactamente qué falló.
 */
type FailedKind =
  | 'entity'
  | 'relationship'
  | 'quote'
  | 'momento'
  | 'momento_entity'
  | 'note'
  | 'task'
  | 'prompt'
  | 'secret'

type FailedItem = {
  kind: FailedKind
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

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
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
    essay: nullableString(item.essay),
    positionX: nullableNumber(item.positionX),
    positionY: nullableNumber(item.positionY),
    spotifyUrl: nullableString(item.spotifyUrl),
    wikipediaUrl: nullableString(item.wikipediaUrl),
    grokipediaUrl: nullableString(item.grokipediaUrl),
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
    userReflection: nullableString(item.userReflection),
    aiReflection: nullableString(item.aiReflection),
    aiReflectionProvider: nullableString(item.aiReflectionProvider),
    aiReflectionModel: nullableString(item.aiReflectionModel),
    aiReflectionAt: nullableString(item.aiReflectionAt),
    linkedQuoteIds: stringArray(item.linkedQuoteIds),
    pinnedAt: nullableString(item.pinnedAt),
    resonance: nullableNumber(item.resonance),
    link: nullableString(item.link),
    origin: item.origin,
  }
}

function incomingMomento(value: unknown): IncomingMomento | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const kind = stringValue(item.kind)
  const payload = asRecord(item.payload)
  if (!id || !kind || !payload) return null
  return {
    id,
    kind,
    capturedAt: nullableString(item.capturedAt),
    payload,
    note: nullableString(item.note),
    origin: item.origin,
    entityIds: stringArray(item.entityIds),
  }
}

function incomingNote(value: unknown): IncomingNote | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const content = stringValue(item.content)
  if (!id || !content) return null
  return {
    id,
    content,
    tags: stringArray(item.tags),
    pinned: booleanValue(item.pinned),
    promotedMomentoId: nullableString(item.promotedMomentoId),
    origin: item.origin,
  }
}

function incomingTask(value: unknown): IncomingTask | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const title = stringValue(item.title)
  if (!id || !title) return null
  const rawPriority = stringValue(item.priority)
  return {
    id,
    title,
    detail: nullableString(item.detail),
    done: booleanValue(item.done),
    dueDate: nullableString(item.dueDate),
    priority:
      rawPriority === 'alta' || rawPriority === 'media' || rawPriority === 'baja'
        ? rawPriority
        : null,
    weekStart: nullableString(item.weekStart),
    completedAt: nullableString(item.completedAt),
    tags: stringArray(item.tags),
    origin: item.origin,
  }
}

function incomingPrompt(value: unknown): IncomingPrompt | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const title = stringValue(item.title)
  const content = stringValue(item.content)
  if (!id || !title || !content) return null
  return {
    id,
    title,
    content,
    collection: nullableString(item.collection),
    tags: stringArray(item.tags),
    variables: stringArray(item.variables),
    favorite: booleanValue(item.favorite),
    useCount: nullableNumber(item.useCount) ?? 0,
    origin: item.origin,
  }
}

function incomingSecret(value: unknown): IncomingSecret | null {
  const item = asRecord(value)
  if (!item) return null
  const id = stringValue(item.id)
  const label = stringValue(item.label)
  const encryptedSecret = stringValue(item.encryptedSecret)
  const kind = stringValue(item.kind)
  if (!id || !label || !encryptedSecret || !kind) return null
  if (!VaultEnvelopeString.safeParse(encryptedSecret).success) return null
  const encryptedService = encryptedField(item.encryptedService ?? item.service)
  const encryptedUsername = encryptedField(item.encryptedUsername ?? item.username)
  const encryptedNotes = encryptedField(item.encryptedNotes ?? item.notes)
  return {
    id,
    label,
    encryptedSecret,
    kind,
    encryptedService,
    encryptedUsername,
    encryptedNotes,
    favorite: booleanValue(item.favorite),
    critical: booleanValue(item.critical),
    expiresAt: nullableString(item.expiresAt),
    lastRotatedAt: nullableString(item.lastRotatedAt),
    origin: item.origin,
  }
}

function encryptedField(value: unknown): string | null {
  const candidate = nullableString(value)
  if (!candidate) return null
  return VaultEnvelopeString.safeParse(candidate).success ? candidate : null
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
  const momentos = payload.momentos ?? []
  const notes = payload.notes ?? []
  const tasks = payload.tasks ?? []
  const prompts = payload.prompts ?? []
  const secrets = payload.secrets ?? []

  let imported = 0
  let skipped = 0
  const failed: FailedItem[] = []

  // Try insert + persist failure on error. The loop never throws — every
  // item gets a chance, errors are collected. Avoids the previous behavior
  // where a single bad INSERT silently aborted everything after it.
  function recordFailure(kind: FailedKind, id: string | null, err: unknown): void {
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

  await forEachConcurrent(entities, IMPORT_CONCURRENCY, async (rawEntity) => {
    const e = incomingEntity(rawEntity)
    if (!e) {
      skipped++
      return
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(e.origin))
      const result = await sqlTyped<{ id: string }>(sql`
        INSERT INTO entities (id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url, user_id)
        VALUES (
          ${resolveImportId(e.id, userId)},
          ${e.type},
          ${e.name},
          ${e.year ?? null},
          ${e.description ?? null},
          ${e.essay ?? null},
          ${e.positionX ?? null},
          ${e.positionY ?? null},
          ${origin}::jsonb,
          ${e.spotifyUrl ?? null},
          ${e.wikipediaUrl ?? null},
          ${e.grokipediaUrl ?? null},
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
  })

  await forEachConcurrent(relationships, IMPORT_CONCURRENCY, async (rawRelationship) => {
    const r = incomingRelationship(rawRelationship)
    if (!r) {
      skipped++
      return
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
  })

  await forEachConcurrent(quotes, IMPORT_CONCURRENCY, async (rawQuote) => {
    const q = incomingQuote(rawQuote)
    if (!q) {
      skipped++
      return
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(q.origin))
      const result = await sqlTyped<{ id: string }>(sql`
        INSERT INTO quotes (id, entity_id, text, source, context, user_reflection, ai_reflection, ai_reflection_provider, ai_reflection_model, ai_reflection_at, linked_quote_ids, pinned_at, resonance, link, origin, user_id)
        VALUES (
          ${resolveImportId(q.id, userId)},
          ${resolveImportId(q.entityId, userId)},
          ${q.text},
          ${q.source ?? null},
          ${q.context ?? null},
          ${q.userReflection ?? null},
          ${q.aiReflection ?? null},
          ${q.aiReflectionProvider ?? null},
          ${q.aiReflectionModel ?? null},
          ${q.aiReflectionAt ?? null},
          ${(q.linkedQuoteIds ?? []).map((id) => resolveImportId(id, userId))},
          ${q.pinnedAt ?? null},
          ${q.resonance ?? null},
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
  })

  await forEachConcurrent(momentos, IMPORT_CONCURRENCY, async (rawMomento) => {
    const m = incomingMomento(rawMomento)
    if (!m) {
      skipped++
      return
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(m.origin))
      const result = await sqlTyped<{ id: string }>(sql`
        INSERT INTO momentos (id, kind, captured_at, payload, note, origin, user_id)
        VALUES (
          ${resolveImportId(m.id, userId)},
          ${m.kind},
          ${m.capturedAt ?? new Date().toISOString()},
          ${JSON.stringify(m.payload)}::jsonb,
          ${m.note ?? null},
          ${origin}::jsonb,
          ${userId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `)
      if (result.length > 0) imported++
      else skipped++
      for (const entityId of m.entityIds) {
        try {
          const linkResult = await sqlTyped<{ momento_id: string }>(sql`
            INSERT INTO momento_entities (momento_id, entity_id, user_id)
            VALUES (
              ${resolveImportId(m.id, userId)},
              ${resolveImportId(entityId, userId)},
              ${userId}
            )
            ON CONFLICT (momento_id, entity_id) DO UPDATE
              SET deleted_at = NULL, user_id = EXCLUDED.user_id
            RETURNING momento_id
          `)
          if (linkResult.length > 0) imported++
          else skipped++
        } catch (err) {
          recordFailure('momento_entity', `${m.id}:${entityId}`, err)
        }
      }
    } catch (err) {
      recordFailure('momento', m.id ?? null, err)
    }
  })

  await forEachConcurrent(notes, IMPORT_CONCURRENCY, async (rawNote) => {
    const n = incomingNote(rawNote)
    if (!n) {
      skipped++
      return
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(n.origin))
      const result = await sqlTyped<{ id: string }>(sql`
        INSERT INTO notes (id, content, tags, pinned, promoted_momento_id, origin, user_id)
        VALUES (
          ${resolveImportId(n.id, userId)},
          ${n.content},
          ${n.tags},
          ${n.pinned},
          ${n.promotedMomentoId ? resolveImportId(n.promotedMomentoId, userId) : null},
          ${origin}::jsonb,
          ${userId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `)
      if (result.length > 0) imported++
      else skipped++
    } catch (err) {
      recordFailure('note', n.id ?? null, err)
    }
  })

  await forEachConcurrent(tasks, IMPORT_CONCURRENCY, async (rawTask) => {
    const t = incomingTask(rawTask)
    if (!t) {
      skipped++
      return
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(t.origin))
      const result = await sqlTyped<{ id: string }>(sql`
        INSERT INTO tasks (id, title, detail, done, due_date, priority, week_start, completed_at, tags, origin, user_id)
        VALUES (
          ${resolveImportId(t.id, userId)},
          ${t.title},
          ${t.detail ?? null},
          ${t.done},
          ${t.dueDate ?? null},
          COALESCE(${t.priority ?? null}, 'media'),
          COALESCE(${t.weekStart ?? null}::date, date_trunc('week', NOW())::date),
          ${t.completedAt ?? null},
          ${t.tags},
          ${origin}::jsonb,
          ${userId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `)
      if (result.length > 0) imported++
      else skipped++
    } catch (err) {
      recordFailure('task', t.id ?? null, err)
    }
  })

  await forEachConcurrent(prompts, IMPORT_CONCURRENCY, async (rawPrompt) => {
    const p = incomingPrompt(rawPrompt)
    if (!p) {
      skipped++
      return
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(p.origin))
      const result = await sqlTyped<{ id: string }>(sql`
        INSERT INTO prompts (id, title, content, collection, tags, variables, favorite, use_count, origin, user_id)
        VALUES (
          ${resolveImportId(p.id, userId)},
          ${p.title},
          ${p.content},
          ${p.collection ?? null},
          ${p.tags},
          ${p.variables},
          ${p.favorite},
          ${p.useCount},
          ${origin}::jsonb,
          ${userId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `)
      if (result.length > 0) imported++
      else skipped++
    } catch (err) {
      recordFailure('prompt', p.id ?? null, err)
    }
  })

  await forEachConcurrent(secrets, IMPORT_CONCURRENCY, async (rawSecret) => {
    const s = incomingSecret(rawSecret)
    if (!s) {
      skipped++
      return
    }
    try {
      const origin = JSON.stringify(normalizeOrigin(s.origin))
      const result = await sqlTyped<{ id: string }>(sql`
        INSERT INTO secrets (
          id, label, secret_value, kind, service, username, notes, favorite, critical,
          expires_at, last_rotated_at, origin, user_id
        )
        VALUES (
          ${resolveImportId(s.id, userId)},
          ${s.label},
          ${s.encryptedSecret},
          ${s.kind},
          ${s.encryptedService ?? null},
          ${s.encryptedUsername ?? null},
          ${s.encryptedNotes ?? null},
          ${s.favorite},
          ${s.critical},
          ${s.expiresAt ?? null},
          ${s.lastRotatedAt ?? null},
          ${origin}::jsonb,
          ${userId}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `)
      if (result.length > 0) imported++
      else skipped++
    } catch (err) {
      recordFailure('secret', s.id ?? null, err)
    }
  })

  return Response.json({
    imported,
    skipped,
    failed,
    scope: {
      label: 'Import estructurado core',
      ...STRUCTURED_CORE_EXPORT_SCOPE,
      warnings: [
        'Importa solo el backup estructurado core; no restaura bytes de blobs, tokens OAuth ni logs.',
        ...STRUCTURED_CORE_EXPORT_SCOPE.warnings,
      ],
    },
    // Retro-compat: clientes viejos sólo leen `imported`.
  })
})

export const config: Config = {
  path: '/api/import',
}
