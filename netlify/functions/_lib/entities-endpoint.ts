import type { Context } from '@netlify/functions'
import { getSql, sqlTyped } from './db.js'
import { withObservability } from './handler-wrap.js'
import { ApiErrors } from './api-error.js'
import { getAuthedUser } from './auth.js'
import { ensureUserRow } from './user-provisioning.js'
import { parseJsonBody } from './zod-body.js'
import { logErrorEvent, logEvent } from './observability.js'
import { EntityCreateBody, EntityPatchBody, EntityRestoreBody } from './entity-schemas.js'
import { embedSafe, toPgVector } from './embeddings.js'
import { parseRows } from './row-parse.js'
import { EntityRowSchema, type EntityRow } from './backend-row-schemas.js'
import {
  buildDuplicateSuggestions,
  buildEntityCreateDraft,
  buildEntityEmbeddingSource,
  clampEntityLimit,
  parseEntityCursor,
  patchTouchesEmbeddingInput,
  shouldReembedEntity,
  type DupRow,
} from './entities-service.js'

export default withObservability(
  'entities',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const limitParam = url.searchParams.get('limit')

      // Backwards-compatible: sin ?limit devolvemos full array (lo que esperan
      // GraphView, sidebar search, ProposalPanel, etc. — modo wholesale).
      // Con ?limit pasamos a paginación por cursor, igual que /api/quotes.
      if (!limitParam) {
        const ENTITY_HARD_CAP = 5000
        const rows = parseRows(
          await sqlTyped<EntityRow>(sql`
        SELECT id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url, created_at, updated_at
        FROM entities
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${ENTITY_HARD_CAP}
      `),
          EntityRowSchema,
          'entities.list.wholesale',
        )
        if (rows.length >= ENTITY_HARD_CAP) {
          // Q2: canónico vía logEvent en lugar de console.warn — queda
          // en los Netlify Functions logs estructurado y queryable.
          logEvent({
            event: 'entities_hard_cap_hit',
            cap: ENTITY_HARD_CAP,
            message: 'Pagination across the app is now needed.',
          })
        }
        return Response.json(rows)
      }

      // Paginated mode. Cursor = "<created_at_iso>:<uuid>" del último item
      // entregado. Tuple comparison (created_at, id) DESC. El compuesto
      // (created_at DESC, id DESC) que se añadió en la migración A vuelve
      // esto sublineal.
      const limit = clampEntityLimit(limitParam)

      const cursor = parseEntityCursor(url.searchParams.get('cursor'))

      const rows = cursor
        ? parseRows(
            await sqlTyped<EntityRow>(sql`
          SELECT id, type, name, year, description, essay,
                 position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url,
                 created_at, updated_at
          FROM entities
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND (created_at, id) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `),
            EntityRowSchema,
            'entities.list.paginated.cursor',
          )
        : parseRows(
            await sqlTyped<EntityRow>(sql`
          SELECT id, type, name, year, description, essay,
                 position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url,
                 created_at, updated_at
          FROM entities
          WHERE deleted_at IS NULL AND user_id = ${userId}
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `),
            EntityRowSchema,
            'entities.list.paginated.first',
          )

      // OJO con el tipo de created_at: el driver Neon HTTP lo deserializa como
      // Date, no como string ISO. Si lo dejamos pasar a una template literal
      // (`${last.created_at}`), JS llama Date.prototype.toString() que produce
      // "Thu May 21 2026 16:12:30 GMT+0000 (Coordinated Universal Time)" — un
      // formato que Postgres NO parsea como timestamptz. Ese cursor vuelve al
      // server, falla el cast `::timestamptz`, y devolvemos 500 en cada scroll.
      // Forzamos ISO 8601 acá, que sí es estable y parseable.
      const items = rows.slice(0, limit)
      const hasMore = rows.length > limit
      const last = items[items.length - 1]
      const nextCursor =
        hasMore && last ? `${new Date(last.created_at).toISOString()}:${last.id}` : null

      return Response.json({ items, nextCursor })
    }

    // POST /api/entities (crear) — pero NO /api/entities/:id/restore (que es
    // otro POST manejado más abajo). Sin este guard, el flujo de crear
    // intentaría parsear el body de restore como una nueva entidad y caería
    // en 500.
    if (req.method === 'POST' && !new URL(req.url).pathname.endsWith('/restore')) {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, EntityCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data
      const draft = buildEntityCreateDraft(body)
      const origin = JSON.stringify(draft.origin)

      // Embed before inserting so the row lands with its vector populated.
      // embedSafe returns null on any failure (no key, network issue, etc.) —
      // the row is still created and a future re-index can backfill.
      const emb = await embedSafe(draft.embedSource)

      // Duplicate-detection guard: if the caller didn't pass `?force=true`,
      // we check whether the new embedding is unusually close to an existing
      // entity (cosine distance < 0.20 ≈ similarity ≥ 0.90). If so, return
      // 409 with the suggested matches so the UI can ask "¿es la misma que X?"
      // before persisting. Skipped when there's no embedding (no key, etc.) —
      // we don't want to block writes just because embeddings are unavailable.
      const url = new URL(req.url)
      const force = url.searchParams.get('force') === 'true'
      if (emb && !force) {
        const dupRows = await sqlTyped<DupRow>(sql`
        SELECT id, name, type, description,
               (embedding <=> ${toPgVector(emb.vector)}::vector) AS distance
        FROM entities
        WHERE deleted_at IS NULL AND user_id = ${userId}
          AND embedding IS NOT NULL
          AND embedding <=> ${toPgVector(emb.vector)}::vector < 0.20
        ORDER BY embedding <=> ${toPgVector(emb.vector)}::vector
        LIMIT 3
      `)
        if (dupRows.length > 0) {
          return ApiErrors.conflict(requestId, 'Posible entidad duplicada', {
            kind: 'possible_duplicate',
            suggestions: buildDuplicateSuggestions(dupRows),
          })
        }
      }

      const rows = parseRows(
        await sqlTyped<EntityRow>(sql`
      INSERT INTO entities (
        type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url,
        embedding, embedding_model, embedding_at, user_id
      )
      VALUES (
        ${body.type},
        ${body.name},
        ${body.year ?? null},
        ${body.description ?? null},
        ${body.essay ?? null},
        ${body.position_x ?? null},
        ${body.position_y ?? null},
        ${origin}::jsonb,
        ${body.spotify_url ?? null},
        ${body.wikipedia_url ?? null},
        ${body.grokipedia_url ?? null},
        ${emb ? toPgVector(emb.vector) : null}::vector,
        ${emb?.model ?? null},
        ${emb ? new Date().toISOString() : null},
        ${userId}
      )
      RETURNING id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url, created_at, updated_at
    `),
        EntityRowSchema,
        'entities.create.returning',
      )
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, EntityPatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data
      let embeddingDirty = false
      // Solo leemos la fila actual si el PATCH tocó algún campo que alimenta el
      // embedding; la decisión pura (¿cambió de verdad el texto?) vive en
      // shouldReembedEntity para no re-embedear sin cambio real (regla AGENTS).
      if (patchTouchesEmbeddingInput(body)) {
        const currentRows = await sqlTyped<{
          name: string
          type: string
          year: number | null
          description: string | null
        }>(sql`
          SELECT name, type, year, description
          FROM entities
          WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        `)
        embeddingDirty = shouldReembedEntity({ patch: body, current: currentRows[0] })
      }
      // Only update fields that were actually sent. Postgres COALESCE pattern.
      const rows = parseRows(
        await sqlTyped<EntityRow>(sql`
      UPDATE entities
      SET
        name        = COALESCE(${body.name ?? null}, name),
        type        = COALESCE(${body.type ?? null}, type),
        year        = CASE WHEN ${body.year !== undefined} THEN ${body.year ?? null} ELSE year END,
        description = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
        essay       = CASE WHEN ${body.essay !== undefined} THEN ${body.essay ?? null} ELSE essay END,
        position_x  = CASE WHEN ${body.position_x !== undefined} THEN ${body.position_x ?? null} ELSE position_x END,
        position_y  = CASE WHEN ${body.position_y !== undefined} THEN ${body.position_y ?? null} ELSE position_y END,
        spotify_url = CASE WHEN ${body.spotify_url !== undefined} THEN ${body.spotify_url ?? null} ELSE spotify_url END,
        wikipedia_url = CASE WHEN ${body.wikipedia_url !== undefined} THEN ${body.wikipedia_url ?? null} ELSE wikipedia_url END,
        grokipedia_url = CASE WHEN ${body.grokipedia_url !== undefined} THEN ${body.grokipedia_url ?? null} ELSE grokipedia_url END
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      RETURNING id, type, name, year, description, essay, position_x, position_y, origin, spotify_url, wikipedia_url, grokipedia_url, created_at, updated_at
    `),
        EntityRowSchema,
        'entities.patch.returning',
      )
      if (rows.length === 0) {
        return ApiErrors.notFound(requestId, 'Entidad no encontrada')
      }

      // Re-embed if anything that feeds the embedding changed. We don't await
      // before responding to keep the PATCH snappy — the embedding catches up
      // in the background (best-effort).
      if (embeddingDirty) {
        const updated = rows[0] as {
          name: string
          type: string
          year: number | null
          description: string | null
        }
        embedSafe(
          buildEntityEmbeddingSource({
            name: updated.name,
            type: updated.type,
            year: updated.year,
            description: updated.description,
          }),
        )
          .then((emb) => {
            if (!emb) return
            return sql`
            UPDATE entities
            SET embedding = ${toPgVector(emb.vector)}::vector,
                embedding_model = ${emb.model},
                embedding_at = NOW()
            WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
          `
          })
          // Best-effort en segundo plano: no frena la respuesta del PATCH, pero
          // dejamos rastro si falla (antes era un `.catch(() => {})` silencioso y
          // la entity quedaba con embedding viejo sin que nadie se enterara).
          .catch((err) => {
            logErrorEvent({
              event: 'entity_embedding_update_failed',
              entityId: id,
              message: err instanceof Error ? err.message : String(err),
            })
          })
      }

      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      // Soft-delete atómico: la entidad + su cascade (relaciones, citas, links de
      // momentos) en UN solo CTE, con un deleted_at compartido (la CTE `ts`).
      // Antes eran 4 writes secuenciales: si el Lambda moría a mitad, quedaba la
      // entidad borrada pero su cascade no (o al revés). El restore usa ese
      // timestamp exacto para revertir solo lo que este acto borró.
      const tsRows = (await sql`
        WITH ts AS (SELECT NOW() AS now),
        del_entity AS (
          UPDATE entities SET deleted_at = (SELECT now FROM ts)
          WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
          RETURNING deleted_at
        ),
        del_rels AS (
          UPDATE relationships SET deleted_at = (SELECT now FROM ts)
          WHERE (from_id = ${id} OR to_id = ${id}) AND deleted_at IS NULL AND user_id = ${userId}
            AND EXISTS (SELECT 1 FROM del_entity)
          RETURNING 1
        ),
        del_quotes AS (
          UPDATE quotes SET deleted_at = (SELECT now FROM ts)
          WHERE entity_id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
            AND EXISTS (SELECT 1 FROM del_entity)
          RETURNING 1
        ),
        del_links AS (
          UPDATE momento_entities SET deleted_at = (SELECT now FROM ts)
          WHERE entity_id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
            AND EXISTS (SELECT 1 FROM del_entity)
          RETURNING 1
        )
        SELECT deleted_at FROM del_entity
      `) as Array<{ deleted_at: string }>
      const deletedAt = tsRows[0]?.deleted_at
      if (!deletedAt) {
        return ApiErrors.notFound(requestId, 'Entidad no encontrada')
      }
      return Response.json({ deletedAt })
    }

    // Restore (undo del DELETE). Recibe el deletedAt exacto del borrado para
    // restaurar la entidad + las filas cascadeadas en ese mismo acto.
    const url = new URL(req.url)
    if (req.method === 'POST' && id && url.pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, EntityRestoreBody, requestId)
      if (!parsed.ok) return parsed.response
      const { deletedAt } = parsed.data
      // Undo atómico simétrico al DELETE: restaura la entidad + el cascade que
      // compartía exactamente ese deleted_at, en un único CTE.
      const rows = await sqlTyped<{ restored: boolean }>(sql`
        WITH restore_entity AS (
          UPDATE entities SET deleted_at = NULL
          WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
          RETURNING 1
        ),
        restore_rels AS (
          UPDATE relationships SET deleted_at = NULL
          WHERE (from_id = ${id} OR to_id = ${id}) AND deleted_at = ${deletedAt} AND user_id = ${userId}
            AND EXISTS (SELECT 1 FROM restore_entity)
          RETURNING 1
        ),
        restore_quotes AS (
          UPDATE quotes SET deleted_at = NULL
          WHERE entity_id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
            AND EXISTS (SELECT 1 FROM restore_entity)
          RETURNING 1
        ),
        restore_links AS (
          UPDATE momento_entities SET deleted_at = NULL
          WHERE entity_id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
            AND EXISTS (SELECT 1 FROM restore_entity)
          RETURNING 1
        )
        SELECT EXISTS(SELECT 1 FROM restore_entity) AS restored
      `)
      if (!rows[0]?.restored) {
        return ApiErrors.notFound(requestId, 'Entidad no encontrada')
      }
      return Response.json({ restored: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)
