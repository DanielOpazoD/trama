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
import { forEachConcurrent } from './_lib/concurrency.js'
import { parseIncomingImportPayload } from './_lib/import-payload.js'
import { normalizeOrigin } from './_lib/origin.js'

// Tope de inserts en vuelo a la vez por fase. Cada insert es un round-trip HTTP
// a Neon; en serie, una importación grande (miles de filas) agota el timeout de
// la función. El pool acotado las paraleliza sin saturar la conexión. Las fases
// (entidades → relaciones → … ) siguen siendo secuenciales para respetar las FK.
const IMPORT_CONCURRENCY = 16

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

  const { entities, relationships, quotes, momentos, notes, tasks, prompts, secrets } =
    parseIncomingImportPayload(payload)

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

  await forEachConcurrent(entities, IMPORT_CONCURRENCY, async (e) => {
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

  await forEachConcurrent(relationships, IMPORT_CONCURRENCY, async (r) => {
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

  await forEachConcurrent(quotes, IMPORT_CONCURRENCY, async (q) => {
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

  await forEachConcurrent(momentos, IMPORT_CONCURRENCY, async (m) => {
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

  await forEachConcurrent(notes, IMPORT_CONCURRENCY, async (n) => {
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

  await forEachConcurrent(tasks, IMPORT_CONCURRENCY, async (t) => {
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

  await forEachConcurrent(prompts, IMPORT_CONCURRENCY, async (p) => {
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

  await forEachConcurrent(secrets, IMPORT_CONCURRENCY, async (s) => {
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
