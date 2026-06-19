import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './db.js'
import { withObservability } from './handler-wrap.js'
import { ApiErrors } from './api-error.js'
import { getAuthedUser } from './auth.js'
import { ensureUserRow } from './user-provisioning.js'
import { parseJsonBody } from './zod-body.js'
import {
  RecorteCreateBody,
  RecortePatchBody,
  RecortePromoteBody,
} from './recorte-schemas.js'
import { RestoreBody } from './restore-schema.js'
import { extensionPreflight, withExtensionCors } from './extension-cors.js'
import { askLLMForJson } from './llm.js'
import { aiOffResponse, resolveAIInvocation } from './ai-mode.js'
import { checkMonthlyBudget } from './cost-cap.js'
import { momentoEmbedText, validatePayloadForKind } from './momento-embed.js'
import { copyRecorteImageToMomentos, removeBlob } from './recorte-to-momento.js'
import { normalizeOrigin } from './origin.js'
import {
  embedSafe,
  entityEmbeddingText,
  quoteEmbeddingText,
  toPgVector,
} from './embeddings.js'
import {
  buildRecorteSuggestPrompt,
  sanitizeSuggestion,
  type EntityLite,
} from './recorte-suggest-prompt.js'

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
type RecorteRow = {
  id: string
  text: string
  source_url: string | null
  source_title: string | null
  source_author: string | null
  note: string | null
  image_url: string | null
  image_key: string | null
  capture_mode: 'citation' | 'article' | 'html' | 'region' | 'image' | null
  status: 'pending' | 'promoted' | 'archived'
  promoted_target: 'quote' | 'entity' | 'momento' | null
  promoted_id: string | null
  captured_at: string | null
  created_at: string
  updated_at: string
  /** Imágenes del recorte-evento (multi-imagen). Solo lo trae el GET/list. */
  images?: Array<{ storage_key: string }> | null
}

export default withObservability(
  'recortes',
  async (req: Request, context: Context, { requestId }) => {
    const preflight = extensionPreflight(req)
    if (preflight) return preflight

    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id
    const cors = (res: Response) => withExtensionCors(req, res)

    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, RestoreBody, requestId)
      if (!parsed.ok) return parsed.response
      const { deletedAt } = parsed.data
      const rows = await sqlTyped<{ restored: boolean }>(sql`
        WITH restore_recorte AS (
          UPDATE recortes SET deleted_at = NULL, updated_at = NOW()
          WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
          RETURNING 1
        )
        SELECT EXISTS (SELECT 1 FROM restore_recorte) AS restored
      `)
      if (!rows[0]?.restored) {
        return ApiErrors.notFound(requestId, 'Recorte no encontrado para restaurar')
      }
      return Response.json({ restored: true })
    }

    // Sugerencia de curaduría con IA (advisory, no muta el recorte): la IA
    // mira el texto + la fuente + tus entidades y propone destino, título y
    // conexiones. Reusa la infra de IA (modo/budget). Degrada a aiOff.
    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/suggest')) {
      const recRows = await sqlTyped<{
        text: string
        source_url: string | null
        source_title: string | null
        source_author: string | null
      }>(sql`
        SELECT text, source_url, source_title, source_author
        FROM recortes
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `)
      const rec = recRows[0]
      if (!rec) return ApiErrors.notFound(requestId, 'Recorte no encontrado')

      const budgetExceeded = await checkMonthlyBudget(userId, requestId)
      if (budgetExceeded) return budgetExceeded

      const invocation = await resolveAIInvocation(req, 'classify', userId)
      if (invocation.kind === 'off') return aiOffResponse(requestId)

      const [typeRows, entityRows] = await Promise.all([
        sqlTyped<{ slug: string }>(
          sql`SELECT slug FROM entity_types ORDER BY sort_order, slug`,
        ),
        sqlTyped<EntityLite>(sql`
          SELECT id, name, type FROM entities
          WHERE deleted_at IS NULL AND user_id = ${userId}
          ORDER BY created_at DESC LIMIT 200
        `),
      ])
      const entityTypes = typeRows.map((r) => r.slug)
      const messages = buildRecorteSuggestPrompt(
        rec.text,
        {
          title: rec.source_title,
          url: rec.source_url,
          author: rec.source_author,
        },
        entityRows,
        entityTypes,
      )
      try {
        const { content } = await askLLMForJson(messages, {
          provider: invocation.provider,
          model: invocation.model,
        })
        const suggestion = sanitizeSuggestion(
          content,
          new Set(entityRows.map((e) => e.id)),
          new Set(entityTypes),
        )
        return Response.json({
          ...suggestion,
          relatedEntities: entityRows.filter((e) =>
            suggestion.relatedEntityIds.includes(e.id),
          ),
        })
      } catch {
        return ApiErrors.internal(requestId, 'La IA no pudo sugerir ahora')
      }
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
          const sourceKeys =
            imgRows.length > 0 ? imgRows.map((r) => r.storage_key) : [rec.image_key]
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
      const url = new URL(req.url)
      const status = url.searchParams.get('status')?.trim()
      const statusFilter =
        status === 'pending' || status === 'promoted' || status === 'archived'
          ? status
          : null
      const rows = await sqlTyped<RecorteRow>(sql`
        SELECT id, text, source_url, source_title, source_author, note,
          image_url, image_key, capture_mode, status, promoted_target,
          promoted_id, source, captured_at, created_at, updated_at,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object('storage_key', ri.storage_key) ORDER BY ri.position)
            FROM recorte_images ri
            WHERE ri.recorte_id = recortes.id AND ri.user_id = ${userId}
          ), '[]'::jsonb) AS images
        FROM recortes
        WHERE deleted_at IS NULL AND user_id = ${userId}
          AND (${statusFilter}::text IS NULL OR status = ${statusFilter})
        ORDER BY created_at DESC, id DESC
        LIMIT 500
      `)
      return cors(Response.json(rows))
    }

    if (req.method === 'POST' && !id) {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, RecorteCreateBody, requestId)
      if (!parsed.ok) return cors(parsed.response)
      const b = parsed.data
      const rows = await sqlTyped<RecorteRow>(sql`
        INSERT INTO recortes (
          text, source_url, source_title, source_author, note, image_url,
          image_key, capture_mode, captured_at, user_id
        ) VALUES (
          ${b.text}, ${b.sourceUrl ?? null}, ${b.sourceTitle ?? null},
          ${b.sourceAuthor ?? null}, ${b.note ?? null}, ${b.imageUrl ?? null},
          ${b.imageKey ?? null}, ${b.captureMode ?? null},
          ${b.capturedAt ?? null}::timestamptz, ${userId}
        )
        RETURNING id, text, source_url, source_title, source_author, note,
          image_url, image_key, capture_mode, status, promoted_target,
          promoted_id, captured_at, created_at, updated_at
      `)
      return cors(Response.json(rows[0], { status: 201 }))
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, RecortePatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const b = parsed.data
      const rows = await sqlTyped<RecorteRow>(sql`
        UPDATE recortes
        SET text = COALESCE(${b.text ?? null}, text),
            source_title = COALESCE(${b.sourceTitle ?? null}, source_title),
            source_author = COALESCE(${b.sourceAuthor ?? null}, source_author),
            image_url = COALESCE(${b.imageUrl ?? null}, image_url),
            note = CASE WHEN ${b.note !== undefined} THEN ${b.note ?? null} ELSE note END,
            status = CASE
                       WHEN ${b.status === 'archived'} THEN 'archived'
                       WHEN ${b.status === 'pending'} THEN 'pending'
                       ELSE status
                     END,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id, text, source_url, source_title, source_author, note,
          image_url, image_key, capture_mode, status, promoted_target,
          promoted_id, captured_at, created_at, updated_at
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Recorte no encontrado')
      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      const rows = await sqlTyped<{ deleted_at: string }>(sql`
        UPDATE recortes SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING deleted_at
      `)
      if (!rows[0]?.deleted_at)
        return ApiErrors.notFound(requestId, 'Recorte no encontrado')
      return Response.json({ ok: true, deletedAt: rows[0].deleted_at })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: [
    '/api/recortes',
    '/api/recortes/:id',
    '/api/recortes/:id/promote',
    '/api/recortes/:id/unpromote',
    '/api/recortes/:id/restore',
    '/api/recortes/:id/suggest',
  ],
}
