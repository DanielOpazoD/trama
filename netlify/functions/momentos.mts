import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { embedSafe, toPgVector } from './_lib/embeddings.js'
import {
  momentoEmbedText,
  validatePayloadForKind,
  type MomentoKind,
} from './_lib/momento-embed.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import {
  MomentoCreateBody,
  MomentoPatchBody,
} from './_lib/momento-schemas.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import {
  buildMomentosListResponse,
  groupMomentoEntityLinks,
  parseMomentosListParams,
  type MomentoEntityLinkRow,
  type MomentoListRow,
} from './_lib/momentos-list.js'

/**
 * /api/momentos — la dimensión temporal de la trama.
 *
 *   GET    /api/momentos?cursor=&limit=&kind=        → lista paginada
 *   GET    /api/momentos/:id                         → uno solo
 *   POST   /api/momentos                             → crear
 *   PATCH  /api/momentos/:id                         → editar
 *   DELETE /api/momentos/:id                         → soft-delete
 *
 * Las entradas tienen tres kinds (nota / recorte / foto). El payload jsonb
 * varía según kind — la validación de shape se hace en código (no en SQL)
 * porque queremos poder agregar kinds sin migración.
 *
 * Linking N:M con entidades vía tabla momento_entities. POST/PATCH aceptan
 * `entityIds` y reemplazan el set completo.
 *
 * Embedding: extraemos texto relevante (bodyText / caption / title / note)
 * y lo embedeamos con OpenAI text-embedding-3-small. Best-effort — si falla
 * (sin key, error de red), el momento se guarda igual sin embedding.
 */

import { normalizeOrigin } from './_lib/origin.js'

type MomentoResponseRow = Record<string, unknown>
type EntityIdRow = { id: string }
type MomentoLinkIdRow = { entity_id: string }
type CurrentMomentoRow = {
  kind: MomentoKind
  payload: Record<string, unknown>
  note: string | null
}
type DeletedMomentoRow = { id: string; deleted_at: string }

export default withObservability('momentos', async (req: Request, context: Context, { requestId }) => {
  const sql = getSql()
  const authedUser = await getAuthedUser(req)
  const userId = authedUser.id
  const id = context.params.id

  // ---------------- GET one ----------------
  if (req.method === 'GET' && id) {
    const rows = await sqlTyped<MomentoResponseRow>(sql`
      SELECT id, kind, captured_at, payload, note, origin,
             created_at, updated_at
      FROM momentos
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
    `)
    if (rows.length === 0) {
      return ApiErrors.notFound(requestId, 'Momento no encontrado')
    }
    // Traemos los entityIds linkeados también, para que el cliente no haga
    // un round-trip aparte.
    const links = await sqlTyped<MomentoLinkIdRow>(sql`
      SELECT entity_id
      FROM momento_entities
      WHERE momento_id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `)
    return Response.json({
      ...rows[0],
      entity_ids: links.map((l) => l.entity_id),
    })
  }

  // ---------------- GET list ----------------
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const { limit, validKind, cursorTs, cursorId } = parseMomentosListParams(url)

    let rows: MomentoListRow[]
    if (cursorTs && cursorId && validKind) {
      rows = await sqlTyped<MomentoListRow>(sql`
        SELECT id, kind, captured_at, payload, note, origin,
               created_at, updated_at
        FROM momentos
        WHERE deleted_at IS NULL
          AND user_id = ${userId}
          AND kind = ${validKind}
          AND (captured_at, id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
        ORDER BY captured_at DESC, id DESC
        LIMIT ${limit + 1}
      `)
    } else if (cursorTs && cursorId) {
      rows = await sqlTyped<MomentoListRow>(sql`
        SELECT id, kind, captured_at, payload, note, origin,
               created_at, updated_at
        FROM momentos
        WHERE deleted_at IS NULL
          AND user_id = ${userId}
          AND (captured_at, id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
        ORDER BY captured_at DESC, id DESC
        LIMIT ${limit + 1}
      `)
    } else if (validKind) {
      rows = await sqlTyped<MomentoListRow>(sql`
        SELECT id, kind, captured_at, payload, note, origin,
               created_at, updated_at
        FROM momentos
        WHERE deleted_at IS NULL AND user_id = ${userId} AND kind = ${validKind}
        ORDER BY captured_at DESC, id DESC
        LIMIT ${limit + 1}
      `)
    } else {
      rows = await sqlTyped<MomentoListRow>(sql`
        SELECT id, kind, captured_at, payload, note, origin,
               created_at, updated_at
        FROM momentos
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY captured_at DESC, id DESC
        LIMIT ${limit + 1}
      `)
    }

    const itemIds = rows.slice(0, limit).map((i) => i.id)

    // Bulk-fetch de links para los items de esta página, dedupe por momento_id.
    let linksByMomento = new Map<string, string[]>()
    if (itemIds.length > 0) {
      const links = await sqlTyped<MomentoEntityLinkRow>(sql`
        SELECT momento_id, entity_id
        FROM momento_entities
        WHERE momento_id = ANY(${itemIds}::uuid[])
          AND user_id = ${userId}
          AND deleted_at IS NULL
      `)
      linksByMomento = groupMomentoEntityLinks(links)
    }

    return Response.json(buildMomentosListResponse({ rows, limit, linksByMomento }))
  }

  // ---------------- POST create ----------------
  if (req.method === 'POST' && !id) {
    const parsed = await parseJsonBody(req, MomentoCreateBody, requestId)
    if (!parsed.ok) return parsed.response
    await ensureUserRow(sql, authedUser)
    const body = parsed.data

    const kind: MomentoKind = body.kind
    const payload = body.payload

    // Validación shape por kind — defiende contra "foto sin storageKey",
    // "nota vacía", etc. Validator puro extraído a _lib/momento-embed.ts.
    const payloadError = validatePayloadForKind(kind, payload)
    if (payloadError) {
      return ApiErrors.validation(requestId, payloadError)
    }

    const note = body.note?.trim() || null
    const origin = normalizeOrigin(body.origin)
    const capturedAt =
      typeof body.captured_at === 'string' && body.captured_at
        ? body.captured_at
        : new Date().toISOString()

    const entityIds = Array.isArray(body.entity_ids)
      ? body.entity_ids.filter((x): x is string => typeof x === 'string')
      : []
    if (entityIds.length > 0) {
      const entityRows = await sqlTyped<EntityIdRow>(sql`
        SELECT id
        FROM entities
        WHERE id = ANY(${entityIds}::uuid[])
          AND deleted_at IS NULL
          AND user_id = ${userId}
      `)
      if (new Set(entityRows.map((row) => row.id)).size !== new Set(entityIds).size) {
        return ApiErrors.notFound(requestId, 'Una o más entidades no existen')
      }
    }

    // Best-effort embedding del texto agregado del momento.
    const embedSource = momentoEmbedText(kind, payload, note)
    const emb = embedSource.length > 0 ? await embedSafe(embedSource) : null

    const inserted = await sqlTyped<MomentoResponseRow>(sql`
      INSERT INTO momentos (
        kind, captured_at, payload, note, origin,
        embedding, embedding_model, embedding_at, user_id
      ) VALUES (
        ${kind},
        ${capturedAt}::timestamptz,
        ${JSON.stringify(payload)}::jsonb,
        ${note},
        ${JSON.stringify(origin)}::jsonb,
        ${emb ? toPgVector(emb.vector) : null}::vector,
        ${emb?.model ?? null},
        ${emb ? new Date().toISOString() : null}::timestamptz,
        ${userId}
      )
      RETURNING id, kind, captured_at, payload, note, origin, created_at, updated_at
    `)
    const row = inserted[0]
    if (!row) {
      return ApiErrors.internal(requestId, 'No se pudo crear el momento')
    }

    // Link a entidades si vienen en el body. Validamos que sean UUIDs en
    // teoría — la FK constraint los rechaza si no existen, así que el
    // server-side no tiene que pegarle a entities para verificar.
    if (entityIds.length > 0) {
      await sql`
        INSERT INTO momento_entities (momento_id, entity_id, user_id)
        SELECT ${row.id}::uuid, e_id, ${userId}
        FROM unnest(${entityIds}::uuid[]) AS e_id
        ON CONFLICT (momento_id, entity_id) DO UPDATE
        SET user_id = EXCLUDED.user_id,
            deleted_at = NULL
      `
    }

    return Response.json(
      { ...row, entity_ids: entityIds },
      { status: 201 },
    )
  }

  // ---------------- PATCH update ----------------
  if (req.method === 'PATCH' && id) {
    const parsed = await parseJsonBody(req, MomentoPatchBody, requestId)
    if (!parsed.ok) return parsed.response
    await ensureUserRow(sql, authedUser)
    const body = parsed.data

    // Lookup actual para conocer kind + valores actuales (no permitimos
    // cambiar kind via PATCH — eso requeriría re-encoding del payload).
    const current = await sqlTyped<CurrentMomentoRow>(sql`
      SELECT kind, payload, note FROM momentos
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
    `)
    const currentRow = current[0]
    if (!currentRow) {
      return ApiErrors.notFound(requestId, 'Momento no encontrado')
    }
    const kind = currentRow.kind

    // ξ-fix-3: detectamos qué cambia realmente para decidir si re-embedear.
    // Antes este PATCH gastaba una llamada a OpenAI en CADA update aunque
    // el cliente solo cambiara entity_ids o captured_at — caro y sin
    // sentido. Ahora solo re-embedeamos cuando cambia payload o note.
    const payloadChanged = body.payload !== undefined
    const noteChanged = body.note !== undefined

    const newPayload = payloadChanged
      ? (body.payload as Record<string, unknown>)
      : currentRow.payload
    const newNote =
      body.note === null
        ? null
        : typeof body.note === 'string'
          ? body.note.trim() || null
          : currentRow.note
    const newCapturedAt =
      typeof body.captured_at === 'string' && body.captured_at
        ? body.captured_at
        : null // null = no cambia

    // Validación shape post-merge (no aceptamos transiciones que dejen
    // el payload inconsistente con el kind).
    if (payloadChanged) {
      const err = validatePayloadForKind(kind, newPayload)
      if (err) return ApiErrors.validation(requestId, err)
    }

    // Re-embed solo si cambió el texto fuente. Si no, conservamos el
    // embedding viejo (no se sobreescribe a null).
    const shouldReembed = payloadChanged || noteChanged
    const embedSource = shouldReembed
      ? momentoEmbedText(kind, newPayload, newNote)
      : ''
    const emb =
      shouldReembed && embedSource.length > 0 ? await embedSafe(embedSource) : null

    // El UPDATE solo toca embedding cuando hubo cambio textual — si
    // shouldReembed=false, lo dejamos como estaba (no se incluye en SET).
    if (newCapturedAt && shouldReembed) {
      await sql`
        UPDATE momentos
        SET payload = ${JSON.stringify(newPayload)}::jsonb,
            note = ${newNote},
            captured_at = ${newCapturedAt}::timestamptz,
            embedding = ${emb ? toPgVector(emb.vector) : null}::vector,
            embedding_model = ${emb?.model ?? null},
            embedding_at = ${emb ? new Date().toISOString() : null}::timestamptz,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `
    } else if (newCapturedAt) {
      // Solo captured_at + posiblemente entityIds — sin re-embed.
      await sql`
        UPDATE momentos
        SET captured_at = ${newCapturedAt}::timestamptz,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `
    } else if (shouldReembed) {
      await sql`
        UPDATE momentos
        SET payload = ${JSON.stringify(newPayload)}::jsonb,
            note = ${newNote},
            embedding = ${emb ? toPgVector(emb.vector) : null}::vector,
            embedding_model = ${emb?.model ?? null},
            embedding_at = ${emb ? new Date().toISOString() : null}::timestamptz,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `
    }

    // Reemplazar set de entityIds si viene.
    if (Array.isArray(body.entity_ids)) {
      const entityIds = body.entity_ids.filter((x): x is string => typeof x === 'string')
      if (entityIds.length > 0) {
        const entityRows = await sqlTyped<EntityIdRow>(sql`
          SELECT id
          FROM entities
          WHERE id = ANY(${entityIds}::uuid[])
            AND deleted_at IS NULL
            AND user_id = ${userId}
        `)
        if (new Set(entityRows.map((row) => row.id)).size !== new Set(entityIds).size) {
          return ApiErrors.notFound(requestId, 'Una o más entidades no existen')
        }
      }
      await sql`
        UPDATE momento_entities
        SET deleted_at = NOW()
        WHERE momento_id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
      `
      if (entityIds.length > 0) {
        await sql`
          INSERT INTO momento_entities (momento_id, entity_id, user_id)
          SELECT ${id}::uuid, e_id, ${userId}
          FROM unnest(${entityIds}::uuid[]) AS e_id
          ON CONFLICT (momento_id, entity_id) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              deleted_at = NULL
        `
      }
    }

    const updated = await sqlTyped<MomentoResponseRow>(sql`
      SELECT id, kind, captured_at, payload, note, origin,
             created_at, updated_at
      FROM momentos
      WHERE id = ${id} AND user_id = ${userId}
    `)
    const links = await sqlTyped<MomentoLinkIdRow>(sql`
      SELECT entity_id
      FROM momento_entities
      WHERE momento_id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
    `)
    return Response.json({
      ...updated[0],
      entity_ids: links.map((l) => l.entity_id),
    })
  }

  // ---------------- DELETE soft ----------------
  if (req.method === 'DELETE' && id) {
    await ensureUserRow(sql, authedUser)
    const result = await sqlTyped<DeletedMomentoRow>(sql`
      UPDATE momentos
      SET deleted_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      RETURNING id, deleted_at
    `)
    const deletedRow = result[0]
    if (!deletedRow) {
      return ApiErrors.notFound(requestId, 'Momento no encontrado')
    }
    return Response.json({ deletedAt: deletedRow.deleted_at })
  }

  return ApiErrors.methodNotAllowed(requestId)
})

export const config: Config = {
  path: ['/api/momentos', '/api/momentos/:id'],
}
