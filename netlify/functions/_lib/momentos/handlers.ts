import { ApiErrors } from '../api-error.js'
import { embedSafe } from '../embeddings.js'
import { validatePayloadForKind } from '../momento-embed.js'
import { parseJsonBody } from '../zod-body.js'
import { parseSearchParams, requestPath } from '../request-contracts.js'
import { MomentoCreateBody, MomentoPatchBody } from '../momento-schemas.js'
import { ensureUserRow } from '../user-provisioning.js'
import { runWithSystemRls } from '../user-rls.js'
import {
  buildMomentosListResponse,
  buildMomentosListParams,
  groupMomentoEntityLinks,
  MomentosListQuery,
} from '../momentos-list.js'
import { logOperationalEvent } from '../operational-events.js'
import {
  buildMomentoCreateDraft,
  buildMomentoPatchDraft,
  ownerIdFromMomentoRow,
} from '../momentos-service.js'
import type { SqlClient } from '../db.js'
import type { AuthedUser } from '../auth.js'
import {
  insertMomentoWithLinks,
  listMomentosPage,
  loadCurrentMomento,
  loadMomentoAfterPatch,
  loadMomentoById,
  loadMomentoEntityLinkIds,
  loadMomentoEntityLinkIdsAfterPatch,
  loadMomentosEntityLinks,
  replaceMomentoEntityLinks,
  selectOwnedEntityIds,
  softDeleteMomento,
  updateMomentoContent,
} from './data.js'

/**
 * Un handler por operación de /api/momentos. Cada uno recibe el contexto ya
 * resuelto por el router (sql, usuario, id, requestId) y devuelve la Response.
 * El acceso a datos vive en `./data.ts`; acá está la orquestación: validación
 * de payload, errores canónicos y armado de respuestas.
 */

// ---------------- GET one ----------------
export async function handleGetMomento(
  sql: SqlClient,
  id: string,
  userId: string,
  requestId: string,
): Promise<Response> {
  const rows = await loadMomentoById(sql, id, userId)
  if (rows.length === 0) {
    return ApiErrors.notFound(requestId, 'Momento no encontrado')
  }
  // Traemos los entityIds linkeados también, para que el cliente no haga
  // un round-trip aparte.
  const links = await loadMomentoEntityLinkIds(
    sql,
    id,
    ownerIdFromMomentoRow(rows[0], userId),
  )
  return Response.json({
    ...rows[0],
    entity_ids: links.map((l) => l.entity_id),
  })
}

// ---------------- GET list ----------------
export async function handleListMomentos(
  req: Request,
  sql: SqlClient,
  userId: string,
  requestId: string,
): Promise<Response> {
  const parsedQuery = parseSearchParams(req, MomentosListQuery, requestId)
  if (!parsedQuery.ok) return parsedQuery.response
  const params = buildMomentosListParams(parsedQuery.data)
  const rows = await listMomentosPage(sql, userId, params)

  const itemIds = rows.slice(0, params.limit).map((i) => i.id)

  // Bulk-fetch de links para los items de esta página, dedupe por momento_id.
  let linksByMomento = new Map<string, string[]>()
  if (itemIds.length > 0) {
    linksByMomento = groupMomentoEntityLinks(await loadMomentosEntityLinks(sql, itemIds))
  }

  return Response.json(
    buildMomentosListResponse({ rows, limit: params.limit, linksByMomento }),
  )
}

// ---------------- POST create ----------------
export async function handleCreateMomento(
  req: Request,
  sql: SqlClient,
  authedUser: AuthedUser,
  userId: string,
  requestId: string,
): Promise<Response> {
  const parsed = await parseJsonBody(req, MomentoCreateBody, requestId)
  if (!parsed.ok) return parsed.response
  await ensureUserRow(sql, authedUser)
  const body = parsed.data
  const draft = buildMomentoCreateDraft(body)

  // Validación shape por kind — defiende contra "foto sin storageKey",
  // "nota vacía", etc. Validator puro extraído a _lib/momento-embed.ts.
  const payloadError = validatePayloadForKind(draft.kind, draft.payload)
  if (payloadError) {
    return ApiErrors.validation(requestId, payloadError)
  }

  const { entityIds } = draft
  if (entityIds.length > 0) {
    const entityRows = await selectOwnedEntityIds(sql, entityIds, userId)
    if (new Set(entityRows.map((row) => row.id)).size !== new Set(entityIds).size) {
      return ApiErrors.notFound(requestId, 'Una o más entidades no existen')
    }
  }

  // Best-effort embedding del texto agregado del momento.
  const embedSource = draft.embedSource
  const emb = embedSource.length > 0 ? await embedSafe(embedSource) : null

  const inserted = await insertMomentoWithLinks(sql, draft, emb, userId)
  const row = inserted[0]
  if (!row) {
    return ApiErrors.internal(requestId, 'No se pudo crear el momento')
  }

  return Response.json({ ...row, entity_ids: entityIds }, { status: 201 })
}

// ---------------- PATCH update ----------------
export async function handleUpdateMomento(
  req: Request,
  sql: SqlClient,
  id: string,
  authedUser: AuthedUser,
  userId: string,
  requestId: string,
): Promise<Response> {
  const parsed = await parseJsonBody(req, MomentoPatchBody, requestId)
  if (!parsed.ok) return parsed.response
  await ensureUserRow(sql, authedUser)
  const body = parsed.data

  // Lookup actual para conocer kind + valores actuales (no permitimos
  // cambiar kind via PATCH — eso requeriría re-encoding del payload).
  const current = await loadCurrentMomento(sql, id, userId)
  const currentRow = current[0]
  if (!currentRow || currentRow.access_role === 'viewer') {
    return ApiErrors.notFound(requestId, 'Momento no encontrado')
  }
  const kind = currentRow.kind
  const ownerUserId = currentRow.user_id
  const draft = buildMomentoPatchDraft({
    current: {
      kind,
      payload: currentRow.payload,
      note: currentRow.note,
    },
    patch: body,
  })
  const newPayload = draft.payload
  const newNote = draft.note
  const newCapturedAt = draft.capturedAt

  // Validación shape post-merge (no aceptamos transiciones que dejen
  // el payload inconsistente con el kind).
  if (draft.payloadChanged) {
    const err = validatePayloadForKind(kind, newPayload)
    if (err) return ApiErrors.validation(requestId, err)
  }

  // Re-embed solo si cambió el texto fuente. Si no, conservamos el
  // embedding viejo (no se sobreescribe a null).
  const shouldReembed = draft.shouldReembed
  const shouldUpdateContent = draft.payloadChanged || draft.noteChanged
  const embedSource = draft.embedSource
  const emb =
    shouldReembed && embedSource.length > 0 ? await embedSafe(embedSource) : null

  if (newCapturedAt || shouldUpdateContent) {
    await updateMomentoContent(sql, {
      id,
      ownerUserId,
      newPayload,
      newNote,
      newCapturedAt,
      shouldUpdateContent,
      shouldReembed,
      emb,
    })
  }

  // Reemplazar set de entityIds si viene.
  if (draft.entityIds) {
    const entityIds = draft.entityIds
    if (entityIds.length > 0) {
      const entityRows = await runWithSystemRls(() =>
        selectOwnedEntityIds(sql, entityIds, ownerUserId),
      )
      if (new Set(entityRows.map((row) => row.id)).size !== new Set(entityIds).size) {
        return ApiErrors.notFound(requestId, 'Una o más entidades no existen')
      }
    }
    await replaceMomentoEntityLinks(sql, id, entityIds, ownerUserId)
  }

  const updated = await loadMomentoAfterPatch(sql, id, userId)
  const links = await loadMomentoEntityLinkIdsAfterPatch(sql, id, ownerUserId)
  return Response.json({
    ...updated[0],
    entity_ids: links.map((l) => l.entity_id),
  })
}

// ---------------- DELETE soft ----------------
export async function handleDeleteMomento(
  req: Request,
  sql: SqlClient,
  id: string,
  authedUser: AuthedUser,
  userId: string,
  requestId: string,
): Promise<Response> {
  await ensureUserRow(sql, authedUser)
  const result = await softDeleteMomento(sql, id, userId)
  const deletedRow = result[0]
  if (!deletedRow) {
    logOperationalEvent({
      event: 'owner.mismatch',
      severity: 'warn',
      requestId,
      method: req.method,
      path: requestPath(req),
      operation: 'momentos.delete',
      userId,
      reason: 'momento_not_visible',
      details: { id },
    })
    return ApiErrors.notFound(requestId, 'Momento no encontrado')
  }
  return Response.json({ deletedAt: deletedRow.deleted_at })
}
