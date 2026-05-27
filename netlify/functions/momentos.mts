import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
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

type Origin = { kind: string; [key: string]: unknown }

function normalizeOrigin(value: unknown): Origin {
  if (value && typeof value === 'object' && 'kind' in (value as Record<string, unknown>)) {
    return value as Origin
  }
  return { kind: 'manual' }
}

function isValidKind(v: unknown): v is MomentoKind {
  return v === 'nota' || v === 'recorte' || v === 'foto'
}

export default withObservability('momentos', async (req: Request, context: Context, { requestId }) => {
  const sql = getSql()
  const { id: userId } = await getAuthedUser(req)
  const id = context.params.id

  // ---------------- GET one ----------------
  if (req.method === 'GET' && id) {
    const rows = (await sql`
      SELECT id, kind, captured_at, payload, note, origin,
             created_at, updated_at
      FROM momentos
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
    `) as Array<Record<string, unknown>>
    if (rows.length === 0) {
      return ApiErrors.notFound(requestId, 'Momento no encontrado')
    }
    // Traemos los entityIds linkeados también, para que el cliente no haga
    // un round-trip aparte.
    const links = (await sql`
      SELECT entity_id FROM momento_entities WHERE momento_id = ${id}
    `) as Array<{ entity_id: string }>
    return Response.json({
      ...rows[0],
      entity_ids: links.map((l) => l.entity_id),
    })
  }

  // ---------------- GET list ----------------
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const kind = url.searchParams.get('kind')
    const limitParam = url.searchParams.get('limit')
    const cursor = url.searchParams.get('cursor')

    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 50
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 200)
      : 50

    // Cursor: "<iso_ts>:<uuid>" — tuple compare sobre (captured_at, id).
    let cursorTs: string | null = null
    let cursorId: string | null = null
    if (cursor) {
      const idx = cursor.lastIndexOf(':')
      if (idx > 0) {
        cursorTs = cursor.slice(0, idx)
        cursorId = cursor.slice(idx + 1)
      }
    }

    const validKind = isValidKind(kind) ? kind : null

    type Row = {
      id: string
      kind: string
      captured_at: Date | string
      payload: unknown
      note: string | null
      origin: unknown
      created_at: Date | string
      updated_at: Date | string
    }

    let rows: Row[]
    if (cursorTs && cursorId && validKind) {
      rows = (await sql`
        SELECT id, kind, captured_at, payload, note, origin,
               created_at, updated_at
        FROM momentos
        WHERE deleted_at IS NULL
          AND user_id = ${userId}
          AND kind = ${validKind}
          AND (captured_at, id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
        ORDER BY captured_at DESC, id DESC
        LIMIT ${limit + 1}
      `) as Row[]
    } else if (cursorTs && cursorId) {
      rows = (await sql`
        SELECT id, kind, captured_at, payload, note, origin,
               created_at, updated_at
        FROM momentos
        WHERE deleted_at IS NULL
          AND user_id = ${userId}
          AND (captured_at, id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
        ORDER BY captured_at DESC, id DESC
        LIMIT ${limit + 1}
      `) as Row[]
    } else if (validKind) {
      rows = (await sql`
        SELECT id, kind, captured_at, payload, note, origin,
               created_at, updated_at
        FROM momentos
        WHERE deleted_at IS NULL AND user_id = ${userId} AND kind = ${validKind}
        ORDER BY captured_at DESC, id DESC
        LIMIT ${limit + 1}
      `) as Row[]
    } else {
      rows = (await sql`
        SELECT id, kind, captured_at, payload, note, origin,
               created_at, updated_at
        FROM momentos
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY captured_at DESC, id DESC
        LIMIT ${limit + 1}
      `) as Row[]
    }

    const hasNext = rows.length > limit
    const items = hasNext ? rows.slice(0, limit) : rows
    let nextCursor: string | null = null
    if (hasNext && items.length > 0) {
      const last = items[items.length - 1]
      // γ1: Neon devuelve Date — convertir a ISO antes de meter en cursor.
      const ts = new Date(last.captured_at).toISOString()
      nextCursor = `${ts}:${last.id}`
    }

    // Bulk-fetch de links para los items de esta página, dedupe por momento_id.
    const itemIds = items.map((i) => i.id)
    let linksByMomento = new Map<string, string[]>()
    if (itemIds.length > 0) {
      const links = (await sql`
        SELECT momento_id, entity_id
        FROM momento_entities
        WHERE momento_id = ANY(${itemIds}::uuid[])
      `) as Array<{ momento_id: string; entity_id: string }>
      for (const link of links) {
        const arr = linksByMomento.get(link.momento_id) ?? []
        arr.push(link.entity_id)
        linksByMomento.set(link.momento_id, arr)
      }
    }

    return Response.json({
      items: items.map((r) => ({
        ...r,
        entity_ids: linksByMomento.get(r.id) ?? [],
      })),
      nextCursor,
    })
  }

  // ---------------- POST create ----------------
  if (req.method === 'POST' && !id) {
    const parsed = await parseJsonBody(req, MomentoCreateBody, requestId)
    if (!parsed.ok) return parsed.response
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

    // Best-effort embedding del texto agregado del momento.
    const embedSource = momentoEmbedText(kind, payload, note)
    const emb = embedSource.length > 0 ? await embedSafe(embedSource) : null

    const inserted = (await sql`
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
    `) as Array<Record<string, unknown>>
    const row = inserted[0]

    // Link a entidades si vienen en el body. Validamos que sean UUIDs en
    // teoría — la FK constraint los rechaza si no existen, así que el
    // server-side no tiene que pegarle a entities para verificar.
    const entityIds = Array.isArray(body.entity_ids)
      ? body.entity_ids.filter((x): x is string => typeof x === 'string')
      : []
    if (entityIds.length > 0) {
      await sql`
        INSERT INTO momento_entities (momento_id, entity_id)
        SELECT ${row.id}::uuid, e_id
        FROM unnest(${entityIds}::uuid[]) AS e_id
        ON CONFLICT DO NOTHING
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
    const body = parsed.data

    // Lookup actual para conocer kind + valores actuales (no permitimos
    // cambiar kind via PATCH — eso requeriría re-encoding del payload).
    const current = (await sql`
      SELECT kind, payload, note FROM momentos
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
    `) as Array<{ kind: MomentoKind; payload: Record<string, unknown>; note: string | null }>
    if (current.length === 0) {
      return ApiErrors.notFound(requestId, 'Momento no encontrado')
    }
    const kind = current[0].kind

    // ξ-fix-3: detectamos qué cambia realmente para decidir si re-embedear.
    // Antes este PATCH gastaba una llamada a OpenAI en CADA update aunque
    // el cliente solo cambiara entity_ids o captured_at — caro y sin
    // sentido. Ahora solo re-embedeamos cuando cambia payload o note.
    const payloadChanged = body.payload !== undefined
    const noteChanged = body.note !== undefined

    const newPayload = payloadChanged
      ? (body.payload as Record<string, unknown>)
      : current[0].payload
    const newNote =
      body.note === null
        ? null
        : typeof body.note === 'string'
          ? body.note.trim() || null
          : current[0].note
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
        WHERE id = ${id} AND user_id = ${userId}
      `
    } else if (newCapturedAt) {
      // Solo captured_at + posiblemente entityIds — sin re-embed.
      await sql`
        UPDATE momentos
        SET captured_at = ${newCapturedAt}::timestamptz,
            updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
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
        WHERE id = ${id} AND user_id = ${userId}
      `
    }

    // Reemplazar set de entityIds si viene.
    if (Array.isArray(body.entity_ids)) {
      const entityIds = body.entity_ids.filter((x): x is string => typeof x === 'string')
      await sql`DELETE FROM momento_entities WHERE momento_id = ${id}`
      if (entityIds.length > 0) {
        await sql`
          INSERT INTO momento_entities (momento_id, entity_id)
          SELECT ${id}::uuid, e_id
          FROM unnest(${entityIds}::uuid[]) AS e_id
          ON CONFLICT DO NOTHING
        `
      }
    }

    const updated = (await sql`
      SELECT id, kind, captured_at, payload, note, origin,
             created_at, updated_at
      FROM momentos
      WHERE id = ${id}
    `) as Array<Record<string, unknown>>
    const links = (await sql`
      SELECT entity_id FROM momento_entities WHERE momento_id = ${id}
    `) as Array<{ entity_id: string }>
    return Response.json({
      ...updated[0],
      entity_ids: links.map((l) => l.entity_id),
    })
  }

  // ---------------- DELETE soft ----------------
  if (req.method === 'DELETE' && id) {
    const result = (await sql`
      UPDATE momentos
      SET deleted_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      RETURNING id, deleted_at
    `) as Array<{ id: string; deleted_at: string }>
    if (result.length === 0) {
      return ApiErrors.notFound(requestId, 'Momento no encontrado')
    }
    return Response.json({ deletedAt: result[0].deleted_at })
  }

  return ApiErrors.methodNotAllowed(requestId)
})

export const config: Config = {
  path: ['/api/momentos', '/api/momentos/:id'],
}
