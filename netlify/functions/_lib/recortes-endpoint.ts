import type { Context } from '@netlify/functions'
import { getSql, sqlTyped } from './db.js'
import { withObservability } from './handler-wrap.js'
import { ApiErrors } from './api-error.js'
import { getAuthedUser } from './auth.js'
import { ensureUserRow } from './user-provisioning.js'
import { parseJsonBody } from './zod-body.js'
import { parseSearchParams } from './request-contracts.js'
import {
  RecorteCreateBody,
  RecortePatchBody,
  RecortePromoteBody,
} from './recorte-schemas.js'
import { RestoreBody } from './restore-schema.js'
import { extensionPreflight, withExtensionCors } from './extension-cors.js'
import { momentoEmbedText, validatePayloadForKind } from './momento-embed.js'
import { copyRecorteImageToMomentos, removeBlob } from './recorte-to-momento.js'
import { normalizeOrigin } from './origin.js'
import {
  embedSafe,
  entityEmbeddingText,
  quoteEmbeddingText,
  toPgVector,
} from './embeddings.js'
import { z } from 'zod'
import { logOperationalEvent } from './operational-events.js'
import { recorteImageSourceKeys, type RecorteRow } from './recortes-service.js'
import {
  createRecorte,
  deleteRecorte,
  listRecortes,
  patchRecorte,
  restoreRecorte,
} from './recortes-crud.js'
import { suggestRecorte } from './recortes-suggest.js'

/**
 * Recortes — bandeja de entrada de capturas web (extensión de Chrome).
 * Todo lo capturado aterriza acá como 'pending'; nada entra al grafo
 * automáticamente. Desde la app, un recorte se promueve a cita/entidad/
 * momento (el objeto destino lo crea el cliente con su endpoint propio;
 * acá se registra la trazabilidad) o se archiva. Soft-delete + restore.
 *
 * CORS: este endpoint responde a orígenes chrome-extension:// (preflight
 * incluido) porque la extensión postea directo desde el browser.
 */
const RecortesListQuery = z.object({
  status: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : undefined),
    z.enum(['pending', 'promoted', 'archived']).optional().catch(undefined),
  ),
})

export default withObservability(
  'recortes',
  async (req: Request, context: Context, { requestId }) => {
    const preflight = extensionPreflight(req)
    if (preflight) return preflight

    const authedUser = await getAuthedUser(req, {
      requestId,
      operation: `recortes.${req.method.toLowerCase()}`,
    })
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id
    const cors = (res: Response) => withExtensionCors(req, res)

    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, RestoreBody, requestId)
      if (!parsed.ok) return parsed.response
      const { deletedAt } = parsed.data
      const restored = await restoreRecorte(sql, id, userId, deletedAt)
      if (!restored) {
        return ApiErrors.notFound(requestId, 'Recorte no encontrado para restaurar')
      }
      return Response.json({ restored: true })
    }

    // Sugerencia de curaduría con IA (advisory, no muta el recorte): la IA
    // mira el texto + la fuente + tus entidades y propone destino, título y
    // conexiones. Reusa la infra de IA (modo/budget). Degrada a aiOff.
    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/suggest')) {
      return suggestRecorte(req, sql, id, userId, requestId)
    }

    // Promoción transaccional: el servidor crea el destino y marca el recorte
    // en un CTE. Si el recorte ya estaba promovido, devuelve la fila existente
    // sin crear otro objeto destino (idempotencia por recorte).
    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/promote')) {
      const parsed = await parseJsonBody(req, RecortePromoteBody, requestId)
      if (!parsed.ok) return parsed.response
      await ensureUserRow(sql, authedUser)
      const origin = JSON.stringify(
        normalizeOrigin({ kind: 'manual', importedFrom: 'recorte' }),
      )
      let rows: RecorteRow[]

      if (parsed.data.target === 'quote') {
        const quote = parsed.data.quote
        const entityNameRows = await sqlTyped<{ name: string }>(sql`
          SELECT name
          FROM entities
          WHERE id = ${quote.entityId}::uuid
            AND deleted_at IS NULL
            AND user_id = ${userId}
        `)
        const quoteEmb = await embedSafe(
          quoteEmbeddingText({
            text: quote.text,
            entityName: entityNameRows[0]?.name ?? null,
            source: quote.source ?? null,
            context: quote.context ?? null,
          }),
        )
        const quoteEmbVector = quoteEmb ? toPgVector(quoteEmb.vector) : null
        const quoteEmbAt = quoteEmb ? new Date().toISOString() : null
        rows = await sqlTyped<RecorteRow>(sql`
          WITH current_recorte AS (
            SELECT id, status
            FROM recortes
            WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
          ),
          inserted AS (
            INSERT INTO quotes (
              entity_id, text, source, context, link, user_reflection,
              linked_quote_ids, origin, embedding, embedding_model, embedding_at, user_id
            )
            SELECT
              ${quote.entityId}::uuid,
              ${quote.text},
              ${quote.source ?? null},
              ${quote.context ?? null},
              ${quote.link ?? null},
              ${quote.userReflection ?? null},
              '{}'::uuid[],
              ${origin}::jsonb,
              ${quoteEmbVector}::vector,
              ${quoteEmb?.model ?? null},
              ${quoteEmbAt}::timestamptz,
              ${userId}
            FROM current_recorte cr
            JOIN entities e
              ON e.id = ${quote.entityId}::uuid
             AND e.deleted_at IS NULL
             AND e.user_id = ${userId}
            WHERE cr.status <> 'promoted'
            RETURNING id
          ),
          marked AS (
            UPDATE recortes r
            SET status = 'promoted',
                promoted_target = 'quote',
                promoted_id = (SELECT id FROM inserted),
                updated_at = NOW()
            WHERE r.id = (SELECT id FROM current_recorte)
              AND r.status <> 'promoted'
              AND EXISTS (SELECT 1 FROM inserted)
            RETURNING r.id, r.text, r.source_url, r.source_title, r.source_author,
              r.note, r.image_url, r.image_key, r.capture_mode, r.status,
              r.promoted_target, r.promoted_id, r.captured_at, r.created_at, r.updated_at
          )
          SELECT id, text, source_url, source_title, source_author, note,
            image_url, image_key, capture_mode, status, promoted_target,
            promoted_id, captured_at, created_at, updated_at
          FROM marked
          UNION ALL
          SELECT r.id, r.text, r.source_url, r.source_title, r.source_author, r.note,
            r.image_url, r.image_key, r.capture_mode, r.status, r.promoted_target,
            r.promoted_id, r.captured_at, r.created_at, r.updated_at
          FROM recortes r
          JOIN current_recorte cr ON cr.id = r.id
          WHERE cr.status = 'promoted'
          LIMIT 1
        `)
      } else if (parsed.data.target === 'entity') {
        const entity = parsed.data.entity
        const entityEmb = await embedSafe(
          entityEmbeddingText({
            name: entity.name,
            type: entity.type,
            year: entity.year ?? null,
            description: entity.description ?? null,
          }),
        )
        const entityEmbVector = entityEmb ? toPgVector(entityEmb.vector) : null
        const entityEmbAt = entityEmb ? new Date().toISOString() : null
        rows = await sqlTyped<RecorteRow>(sql`
          WITH current_recorte AS (
            SELECT id, status
            FROM recortes
            WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
          ),
          inserted AS (
            INSERT INTO entities (
              type, name, description, origin, embedding, embedding_model, embedding_at, user_id
            )
            SELECT
              ${entity.type},
              ${entity.name},
              ${entity.description ?? null},
              ${origin}::jsonb,
              ${entityEmbVector}::vector,
              ${entityEmb?.model ?? null},
              ${entityEmbAt}::timestamptz,
              ${userId}
            FROM current_recorte cr
            WHERE cr.status <> 'promoted'
            RETURNING id
          ),
          marked AS (
            UPDATE recortes r
            SET status = 'promoted',
                promoted_target = 'entity',
                promoted_id = (SELECT id FROM inserted),
                updated_at = NOW()
            WHERE r.id = (SELECT id FROM current_recorte)
              AND r.status <> 'promoted'
              AND EXISTS (SELECT 1 FROM inserted)
            RETURNING r.id, r.text, r.source_url, r.source_title, r.source_author,
              r.note, r.image_url, r.image_key, r.capture_mode, r.status,
              r.promoted_target, r.promoted_id, r.captured_at, r.created_at, r.updated_at
          )
          SELECT id, text, source_url, source_title, source_author, note,
            image_url, image_key, capture_mode, status, promoted_target,
            promoted_id, captured_at, created_at, updated_at
          FROM marked
          UNION ALL
          SELECT r.id, r.text, r.source_url, r.source_title, r.source_author, r.note,
            r.image_url, r.image_key, r.capture_mode, r.status, r.promoted_target,
            r.promoted_id, r.captured_at, r.created_at, r.updated_at
          FROM recortes r
          JOIN current_recorte cr ON cr.id = r.id
          WHERE cr.status = 'promoted'
          LIMIT 1
        `)
      } else {
        const momento = parsed.data.momento
        const kind = momento.kind
        let payload: Record<string, unknown> = momento.payload

        // Captura con imagen propia → Momento FOTO. El cliente pide kind:'foto'
        // y acá copiamos el blob de recortes-media a momentos-media (server-side;
        // el cliente no toca Blobs — AGENTS.md), adjuntando la storageKey
        // resultante para que /api/momentos-file pueda servir la foto.
        if (kind === 'foto') {
          const recRows = await sqlTyped<{
            status: string
            image_key: string | null
          }>(sql`
            SELECT status, image_key
            FROM recortes
            WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
          `)
          const rec = recRows[0]
          if (!rec) {
            return ApiErrors.notFound(
              requestId,
              'Recorte no encontrado o no se pudo promover',
            )
          }
          if (rec.status === 'promoted') {
            // Idempotente: ya se promovió antes. Devolvemos la fila tal cual,
            // sin copiar otro blob ni insertar un momento duplicado.
            const existing = await sqlTyped<RecorteRow>(sql`
              SELECT id, text, source_url, source_title, source_author, note,
                image_url, image_key, capture_mode, status, promoted_target,
                promoted_id, captured_at, created_at, updated_at
              FROM recortes
              WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
            `)
            if (existing.length === 0) {
              return ApiErrors.notFound(requestId, 'Recorte no encontrado')
            }
            return Response.json(existing[0])
          }
          if (!rec.image_key) {
            return ApiErrors.validation(
              requestId,
              'La captura no tiene una imagen propia para promover como foto',
            )
          }
          // Todas las imágenes del recorte-evento (recorte_images por posición);
          // si no hay filas, la image_key legacy como única imagen. Copiamos
          // cada blob a momentos-media para preservar el evento completo al
          // promover (un recorte de varias fotos → un Momento foto episódico).
          const imgRows = await sqlTyped<{ storage_key: string }>(sql`
            SELECT storage_key
            FROM recorte_images
            WHERE recorte_id = ${id} AND user_id = ${userId}
            ORDER BY position ASC
          `)
          const sourceKeys = recorteImageSourceKeys({
            imageKey: rec.image_key,
            images: imgRows,
          })
          const copiedKeys: string[] = []
          for (const key of sourceKeys) {
            const copied = await copyRecorteImageToMomentos(key, userId)
            if (!copied) {
              // Copia a media tanda: limpiamos las ya copiadas para no dejar
              // blobs huérfanos en momentos-media y abortamos sin promover.
              await Promise.all(copiedKeys.map((k) => removeBlob('momentos-media', k)))
              return ApiErrors.validation(
                requestId,
                'No se pudo leer la imagen de la captura',
              )
            }
            copiedKeys.push(copied.storageKey)
          }
          // Una sola imagen → storageKey legacy (compatibilidad de lectura);
          // varias → items[] (episodio foto). El lector prefiere items[].
          payload =
            copiedKeys.length > 1
              ? { ...payload, items: copiedKeys.map((storageKey) => ({ storageKey })) }
              : { ...payload, storageKey: copiedKeys[0] }
        }

        const payloadError = validatePayloadForKind(kind, payload)
        if (payloadError) return ApiErrors.validation(requestId, payloadError)
        const momentoEmbSource = momentoEmbedText(kind, payload, momento.note ?? null)
        const momentoEmb =
          momentoEmbSource.length > 0 ? await embedSafe(momentoEmbSource) : null
        const momentoEmbVector = momentoEmb ? toPgVector(momentoEmb.vector) : null
        const momentoEmbAt = momentoEmb ? new Date().toISOString() : null
        rows = await sqlTyped<RecorteRow>(sql`
          WITH current_recorte AS (
            SELECT id, status
            FROM recortes
            WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
          ),
          inserted AS (
            INSERT INTO momentos (
              kind, captured_at, payload, note, origin,
              embedding, embedding_model, embedding_at, user_id
            )
            SELECT
              ${kind},
              ${momento.capturedAt ?? new Date().toISOString()}::timestamptz,
              ${JSON.stringify(payload)}::jsonb,
              ${momento.note ?? null},
              ${origin}::jsonb,
              ${momentoEmbVector}::vector,
              ${momentoEmb?.model ?? null},
              ${momentoEmbAt}::timestamptz,
              ${userId}
            FROM current_recorte cr
            WHERE cr.status <> 'promoted'
            RETURNING id
          ),
          marked AS (
            UPDATE recortes r
            SET status = 'promoted',
                promoted_target = 'momento',
                promoted_id = (SELECT id FROM inserted),
                updated_at = NOW()
            WHERE r.id = (SELECT id FROM current_recorte)
              AND r.status <> 'promoted'
              AND EXISTS (SELECT 1 FROM inserted)
            RETURNING r.id, r.text, r.source_url, r.source_title, r.source_author,
              r.note, r.image_url, r.image_key, r.capture_mode, r.status,
              r.promoted_target, r.promoted_id, r.captured_at, r.created_at, r.updated_at
          )
          SELECT id, text, source_url, source_title, source_author, note,
            image_url, image_key, capture_mode, status, promoted_target,
            promoted_id, captured_at, created_at, updated_at
          FROM marked
          UNION ALL
          SELECT r.id, r.text, r.source_url, r.source_title, r.source_author, r.note,
            r.image_url, r.image_key, r.capture_mode, r.status, r.promoted_target,
            r.promoted_id, r.captured_at, r.created_at, r.updated_at
          FROM recortes r
          JOIN current_recorte cr ON cr.id = r.id
          WHERE cr.status = 'promoted'
          LIMIT 1
        `)
      }

      if (rows.length === 0) {
        return ApiErrors.notFound(
          requestId,
          'Recorte no encontrado o no se pudo promover',
        )
      }
      return Response.json(rows[0])
    }

    // Reversa transaccional de /promote (Deshacer del triage de 1 toque):
    // soft-borra el objeto destino que la promoción creó y devuelve el recorte
    // a 'pending', limpiando promoted_target/promoted_id en el mismo CTE. Cada
    // rama de borrado se condiciona al target real para tocar una sola tabla.
    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/unpromote')) {
      const rows = await sqlTyped<RecorteRow>(sql`
        WITH current_recorte AS (
          SELECT id, promoted_target, promoted_id
          FROM recortes
          WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
            AND status = 'promoted'
        ),
        del_quote AS (
          UPDATE quotes SET deleted_at = NOW()
          WHERE id = (SELECT promoted_id FROM current_recorte)
            AND (SELECT promoted_target FROM current_recorte) = 'quote'
            AND deleted_at IS NULL
            AND user_id = ${userId}
          RETURNING id
        ),
        del_entity AS (
          UPDATE entities SET deleted_at = NOW()
          WHERE id = (SELECT promoted_id FROM current_recorte)
            AND (SELECT promoted_target FROM current_recorte) = 'entity'
            AND deleted_at IS NULL
            AND user_id = ${userId}
          RETURNING id
        ),
        del_momento AS (
          UPDATE momentos SET deleted_at = NOW(), updated_at = NOW()
          WHERE id = (SELECT promoted_id FROM current_recorte)
            AND (SELECT promoted_target FROM current_recorte) = 'momento'
            AND deleted_at IS NULL
            AND user_id = ${userId}
          RETURNING id
        ),
        reset AS (
          UPDATE recortes r
          SET status = 'pending',
              promoted_target = NULL,
              promoted_id = NULL,
              updated_at = NOW()
          WHERE r.id = (SELECT id FROM current_recorte)
          RETURNING r.id, r.text, r.source_url, r.source_title, r.source_author,
            r.note, r.image_url, r.image_key, r.capture_mode, r.status,
            r.promoted_target, r.promoted_id, r.captured_at, r.created_at, r.updated_at
        )
        SELECT id, text, source_url, source_title, source_author, note,
          image_url, image_key, capture_mode, status, promoted_target,
          promoted_id, captured_at, created_at, updated_at
        FROM reset
      `)
      if (rows.length === 0) {
        return ApiErrors.notFound(
          requestId,
          'Recorte no encontrado o no estaba promovido',
        )
      }
      return Response.json(rows[0])
    }

    if (req.method === 'GET') {
      const parsedQuery = parseSearchParams(req, RecortesListQuery, requestId)
      if (!parsedQuery.ok) return parsedQuery.response
      const statusFilter = parsedQuery.data.status ?? null
      const rows = await listRecortes(sql, userId, statusFilter)
      return cors(Response.json(rows))
    }

    if (req.method === 'POST' && !id) {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, RecorteCreateBody, requestId)
      if (!parsed.ok) return cors(parsed.response)
      const row = await createRecorte(sql, userId, parsed.data)
      return cors(Response.json(row, { status: 201 }))
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, RecortePatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const row = await patchRecorte(sql, id, userId, parsed.data)
      if (!row) {
        logOperationalEvent({
          event: 'owner.mismatch',
          severity: 'warn',
          requestId,
          method: req.method,
          path: new URL(req.url).pathname,
          operation: 'recortes.patch',
          userId,
          reason: 'recorte_not_visible',
          details: { id },
        })
        return ApiErrors.notFound(requestId, 'Recorte no encontrado')
      }
      return Response.json(row)
    }

    if (req.method === 'DELETE' && id) {
      const deletedAt = await deleteRecorte(sql, id, userId)
      if (!deletedAt) {
        logOperationalEvent({
          event: 'owner.mismatch',
          severity: 'warn',
          requestId,
          method: req.method,
          path: new URL(req.url).pathname,
          operation: 'recortes.delete',
          userId,
          reason: 'recorte_not_visible',
          details: { id },
        })
        return ApiErrors.notFound(requestId, 'Recorte no encontrado')
      }
      return Response.json({ ok: true, deletedAt })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)
