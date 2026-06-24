import type { Context } from '@netlify/functions'
import { getSql } from './db.js'
import { withObservability } from './handler-wrap.js'
import { ApiErrors } from './api-error.js'
import { embedSafe } from './embeddings.js'
import { validatePayloadForKind } from './momento-embed.js'
import { getAuthedUser } from './auth.js'
import { parseJsonBody } from './zod-body.js'
import { parseSearchParams, requestPath } from './request-contracts.js'
import { MomentoCreateBody, MomentoPatchBody } from './momento-schemas.js'
import { ensureUserRow } from './user-provisioning.js'
import { runWithSystemRls } from './user-rls.js'
import {
  buildMomentosListResponse,
  buildMomentosListParams,
  groupMomentoEntityLinks,
  MomentosListQuery,
} from './momentos-list.js'
import { logOperationalEvent } from './operational-events.js'
import {
  buildMomentoCreateDraft,
  buildMomentoPatchDraft,
  ownerIdFromMomentoRow,
} from './momentos-service.js'
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
} from './momentos/data.js'

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
 *
 * El acceso a datos vive en `./momentos/data.ts`; este handler orquesta:
 * auth, validación de payload, errores canónicos y armado de respuestas.
 */

export default withObservability(
  'momentos',
  async (req: Request, context: Context, { requestId }) => {
    const sql = getSql()
    const authedUser = await getAuthedUser(req, {
      requestId,
      operation: `momentos.${req.method.toLowerCase()}`,
    })
    const userId = authedUser.id
    const id = context.params.id

    // ---------------- GET one ----------------
    if (req.method === 'GET' && id) {
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
    if (req.method === 'GET') {
      const parsedQuery = parseSearchParams(req, MomentosListQuery, requestId)
      if (!parsedQuery.ok) return parsedQuery.response
      const params = buildMomentosListParams(parsedQuery.data)
      const rows = await listMomentosPage(sql, userId, params)

      const itemIds = rows.slice(0, params.limit).map((i) => i.id)

      // Bulk-fetch de links para los items de esta página, dedupe por momento_id.
      let linksByMomento = new Map<string, string[]>()
      if (itemIds.length > 0) {
        linksByMomento = groupMomentoEntityLinks(
          await loadMomentosEntityLinks(sql, itemIds),
        )
      }

      return Response.json(
        buildMomentosListResponse({ rows, limit: params.limit, linksByMomento }),
      )
    }

    // ---------------- POST create ----------------
    if (req.method === 'POST' && !id) {
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
    if (req.method === 'PATCH' && id) {
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
    if (req.method === 'DELETE' && id) {
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

    return ApiErrors.methodNotAllowed(requestId)
  },
)
