import type { Context } from '@netlify/functions'
import { getSql, sqlTyped } from './db.js'
import { withObservability } from './handler-wrap.js'
import { ApiErrors } from './api-error.js'
import { embedSafe, toPgVector } from './embeddings.js'
import { validatePayloadForKind, type MomentoKind } from './momento-embed.js'
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
  type MomentoEntityLinkRow,
  type MomentoListRow,
} from './momentos-list.js'
import { logOperationalEvent } from './operational-events.js'
import {
  buildMomentoCreateDraft,
  buildMomentoPatchDraft,
  ownerIdFromMomentoRow,
} from './momentos-service.js'

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

type MomentoResponseRow = Record<string, unknown>
type EntityIdRow = { id: string }
type MomentoLinkIdRow = { entity_id: string }
type CurrentMomentoRow = {
  kind: MomentoKind
  payload: Record<string, unknown>
  note: string | null
  user_id: string
  access_role: 'owner' | 'viewer' | 'editor' | null
}
type DeletedMomentoRow = { id: string; deleted_at: string }

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
      const rows = await runWithSystemRls(() =>
        sqlTyped<MomentoResponseRow>(sql`
      SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
             m.created_at, m.updated_at,
             m.user_id AS owner_user_id,
             owner.display_name AS owner_display_name,
             owner.email AS owner_email,
             CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
             (m.user_id <> ${userId}) AS shared
      FROM momentos m
      LEFT JOIN momento_space_access msa
        ON msa.owner_user_id = m.user_id
       AND msa.member_user_id = ${userId}
       AND msa.deleted_at IS NULL
      LEFT JOIN users owner ON owner.id = m.user_id
      WHERE m.id = ${id}
        AND m.deleted_at IS NULL
        AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
    `),
      )
      if (rows.length === 0) {
        return ApiErrors.notFound(requestId, 'Momento no encontrado')
      }
      // Traemos los entityIds linkeados también, para que el cliente no haga
      // un round-trip aparte. El JOIN a entities excluye entidades soft-borradas:
      // el link sobrevive (restaurar la entidad lo revive), pero no se lista.
      const links = await runWithSystemRls(() =>
        sqlTyped<MomentoLinkIdRow>(sql`
      SELECT me.entity_id
      FROM momento_entities me
      JOIN entities e ON e.id = me.entity_id AND e.deleted_at IS NULL
      WHERE me.momento_id = ${id}
        AND me.user_id = ${ownerIdFromMomentoRow(rows[0], userId)}
        AND me.deleted_at IS NULL
    `),
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
      const { limit, validKind, cursorTs, cursorId } = buildMomentosListParams(
        parsedQuery.data,
      )

      let rows: MomentoListRow[]
      if (cursorTs && cursorId && validKind) {
        rows = await runWithSystemRls(() =>
          sqlTyped<MomentoListRow>(sql`
        SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
               m.created_at, m.updated_at,
               m.user_id AS owner_user_id,
               owner.display_name AS owner_display_name,
               owner.email AS owner_email,
               CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
               (m.user_id <> ${userId}) AS shared
        FROM momentos m
        LEFT JOIN momento_space_access msa
          ON msa.owner_user_id = m.user_id
         AND msa.member_user_id = ${userId}
         AND msa.deleted_at IS NULL
        LEFT JOIN users owner ON owner.id = m.user_id
        WHERE m.deleted_at IS NULL
          AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
          AND m.kind = ${validKind}
          AND (m.captured_at, m.id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
        ORDER BY m.captured_at DESC, m.id DESC
        LIMIT ${limit + 1}
      `),
        )
      } else if (cursorTs && cursorId) {
        rows = await runWithSystemRls(() =>
          sqlTyped<MomentoListRow>(sql`
        SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
               m.created_at, m.updated_at,
               m.user_id AS owner_user_id,
               owner.display_name AS owner_display_name,
               owner.email AS owner_email,
               CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
               (m.user_id <> ${userId}) AS shared
        FROM momentos m
        LEFT JOIN momento_space_access msa
          ON msa.owner_user_id = m.user_id
         AND msa.member_user_id = ${userId}
         AND msa.deleted_at IS NULL
        LEFT JOIN users owner ON owner.id = m.user_id
        WHERE m.deleted_at IS NULL
          AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
          AND (m.captured_at, m.id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
        ORDER BY m.captured_at DESC, m.id DESC
        LIMIT ${limit + 1}
      `),
        )
      } else if (validKind) {
        rows = await runWithSystemRls(() =>
          sqlTyped<MomentoListRow>(sql`
        SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
               m.created_at, m.updated_at,
               m.user_id AS owner_user_id,
               owner.display_name AS owner_display_name,
               owner.email AS owner_email,
               CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
               (m.user_id <> ${userId}) AS shared
        FROM momentos m
        LEFT JOIN momento_space_access msa
          ON msa.owner_user_id = m.user_id
         AND msa.member_user_id = ${userId}
         AND msa.deleted_at IS NULL
        LEFT JOIN users owner ON owner.id = m.user_id
        WHERE m.deleted_at IS NULL
          AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
          AND m.kind = ${validKind}
        ORDER BY m.captured_at DESC, m.id DESC
        LIMIT ${limit + 1}
      `),
        )
      } else {
        rows = await runWithSystemRls(() =>
          sqlTyped<MomentoListRow>(sql`
        SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
               m.created_at, m.updated_at,
               m.user_id AS owner_user_id,
               owner.display_name AS owner_display_name,
               owner.email AS owner_email,
               CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
               (m.user_id <> ${userId}) AS shared
        FROM momentos m
        LEFT JOIN momento_space_access msa
          ON msa.owner_user_id = m.user_id
         AND msa.member_user_id = ${userId}
         AND msa.deleted_at IS NULL
        LEFT JOIN users owner ON owner.id = m.user_id
        WHERE m.deleted_at IS NULL
          AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
        ORDER BY m.captured_at DESC, m.id DESC
        LIMIT ${limit + 1}
      `),
        )
      }

      const itemIds = rows.slice(0, limit).map((i) => i.id)

      // Bulk-fetch de links para los items de esta página, dedupe por momento_id.
      // El JOIN a entities excluye entidades soft-borradas (mismo criterio que
      // el GET individual): el link queda latente hasta un eventual restore.
      let linksByMomento = new Map<string, string[]>()
      if (itemIds.length > 0) {
        const links = await runWithSystemRls(() =>
          sqlTyped<MomentoEntityLinkRow>(sql`
        SELECT me.momento_id, me.entity_id
        FROM momento_entities me
        JOIN momentos m ON m.id = me.momento_id
        JOIN entities e ON e.id = me.entity_id AND e.deleted_at IS NULL
        WHERE me.momento_id = ANY(${itemIds}::uuid[])
          AND me.user_id = m.user_id
          AND me.deleted_at IS NULL
      `),
        )
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
      const draft = buildMomentoCreateDraft(body)

      // Validación shape por kind — defiende contra "foto sin storageKey",
      // "nota vacía", etc. Validator puro extraído a _lib/momento-embed.ts.
      const payloadError = validatePayloadForKind(draft.kind, draft.payload)
      if (payloadError) {
        return ApiErrors.validation(requestId, payloadError)
      }

      const { kind, payload, note, origin, capturedAt, entityIds } = draft
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
      const embedSource = draft.embedSource
      const emb = embedSource.length > 0 ? await embedSafe(embedSource) : null

      // Crear el momento + linkear sus entidades en UN solo CTE (atomicidad: el
      // momento no queda sin sus links si el Lambda muere a mitad). Las entidades
      // ya se validaron arriba; con entity_ids vacío, `unnest` no inserta nada.
      // Convención "mutación multi-tabla → CTE" (docs/conventions/dominios.md).
      // Si tocás este CTE, actualizá scripts/check-cte-regression.sql.
      const inserted = await sqlTyped<MomentoResponseRow>(sql`
      WITH ins AS (
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
      ),
      link AS (
        INSERT INTO momento_entities (momento_id, entity_id, user_id)
        SELECT (SELECT id FROM ins), e_id, ${userId}
        FROM unnest(${entityIds}::uuid[]) AS e_id
        ON CONFLICT (momento_id, entity_id) DO UPDATE
        SET user_id = EXCLUDED.user_id, deleted_at = NULL
        RETURNING 1
      )
      SELECT id, kind, captured_at, payload, note, origin, created_at, updated_at FROM ins
    `)
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
      const current = await runWithSystemRls(() =>
        sqlTyped<CurrentMomentoRow>(sql`
      SELECT m.kind, m.payload, m.note, m.user_id,
             CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role
      FROM momentos m
      LEFT JOIN momento_space_access msa
        ON msa.owner_user_id = m.user_id
       AND msa.member_user_id = ${userId}
       AND msa.deleted_at IS NULL
      WHERE m.id = ${id}
        AND m.deleted_at IS NULL
        AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
    `),
      )
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
      const embedSource = draft.embedSource
      const emb =
        shouldReembed && embedSource.length > 0 ? await embedSafe(embedSource) : null

      // El UPDATE solo toca embedding cuando hubo cambio textual — si
      // shouldReembed=false, lo dejamos como estaba (no se incluye en SET).
      if (newCapturedAt && shouldReembed) {
        await runWithSystemRls(
          () => sql`
        UPDATE momentos
        SET payload = ${JSON.stringify(newPayload)}::jsonb,
            note = ${newNote},
            captured_at = ${newCapturedAt}::timestamptz,
            embedding = ${emb ? toPgVector(emb.vector) : null}::vector,
            embedding_model = ${emb?.model ?? null},
            embedding_at = ${emb ? new Date().toISOString() : null}::timestamptz,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${ownerUserId}
      `,
        )
      } else if (newCapturedAt) {
        // Solo captured_at + posiblemente entityIds — sin re-embed.
        await runWithSystemRls(
          () => sql`
        UPDATE momentos
        SET captured_at = ${newCapturedAt}::timestamptz,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${ownerUserId}
      `,
        )
      } else if (shouldReembed) {
        await runWithSystemRls(
          () => sql`
        UPDATE momentos
        SET payload = ${JSON.stringify(newPayload)}::jsonb,
            note = ${newNote},
            embedding = ${emb ? toPgVector(emb.vector) : null}::vector,
            embedding_model = ${emb?.model ?? null},
            embedding_at = ${emb ? new Date().toISOString() : null}::timestamptz,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${ownerUserId}
      `,
        )
      }

      // Reemplazar set de entityIds si viene.
      if (draft.entityIds) {
        const entityIds = draft.entityIds
        if (entityIds.length > 0) {
          const entityRows = await runWithSystemRls(() =>
            sqlTyped<EntityIdRow>(sql`
          SELECT id
          FROM entities
          WHERE id = ANY(${entityIds}::uuid[])
            AND deleted_at IS NULL
            AND user_id = ${ownerUserId}
        `),
          )
          if (new Set(entityRows.map((row) => row.id)).size !== new Set(entityIds).size) {
            return ApiErrors.notFound(requestId, 'Una o más entidades no existen')
          }
        }
        await runWithSystemRls(
          () => sql`
        UPDATE momento_entities
        SET deleted_at = NOW()
        WHERE momento_id = ${id} AND user_id = ${ownerUserId} AND deleted_at IS NULL
      `,
        )
        if (entityIds.length > 0) {
          await runWithSystemRls(
            () => sql`
          INSERT INTO momento_entities (momento_id, entity_id, user_id)
          SELECT ${id}::uuid, e_id, ${ownerUserId}
          FROM unnest(${entityIds}::uuid[]) AS e_id
          ON CONFLICT (momento_id, entity_id) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              deleted_at = NULL
        `,
          )
        }
      }

      const updated = await runWithSystemRls(() =>
        sqlTyped<MomentoResponseRow>(sql`
      SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
             m.created_at, m.updated_at,
             m.user_id AS owner_user_id,
             owner.display_name AS owner_display_name,
             owner.email AS owner_email,
             CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
             (m.user_id <> ${userId}) AS shared
      FROM momentos m
      LEFT JOIN momento_space_access msa
        ON msa.owner_user_id = m.user_id
       AND msa.member_user_id = ${userId}
       AND msa.deleted_at IS NULL
      LEFT JOIN users owner ON owner.id = m.user_id
      WHERE m.id = ${id}
    `),
      )
      const links = await runWithSystemRls(() =>
        sqlTyped<MomentoLinkIdRow>(sql`
      SELECT entity_id
      FROM momento_entities
      WHERE momento_id = ${id} AND user_id = ${ownerUserId} AND deleted_at IS NULL
    `),
      )
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
