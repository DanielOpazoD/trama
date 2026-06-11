import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import {
  RecorteCreateBody,
  RecortePatchBody,
  RecortePromoteBody,
} from './_lib/recorte-schemas.js'
import { RestoreBody } from './_lib/restore-schema.js'
import { extensionPreflight, withExtensionCors } from './_lib/extension-cors.js'
import { askLLMForJson } from './_lib/llm.js'
import { aiOffResponse, resolveAIInvocation } from './_lib/ai-mode.js'
import { checkMonthlyBudget } from './_lib/cost-cap.js'
import {
  buildRecorteSuggestPrompt,
  sanitizeSuggestion,
  type EntityLite,
} from './_lib/recorte-suggest-prompt.js'

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
  status: 'pending' | 'promoted' | 'archived'
  promoted_target: 'quote' | 'entity' | 'momento' | null
  promoted_id: string | null
  captured_at: string | null
  created_at: string
  updated_at: string
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

    // Promoción: el cliente ya creó el objeto destino (cita/entidad/momento)
    // con su endpoint propio; acá el recorte queda marcado y trazado. Guard:
    // un recorte promovido no se promueve dos veces.
    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/promote')) {
      const parsed = await parseJsonBody(req, RecortePromoteBody, requestId)
      if (!parsed.ok) return parsed.response
      const { target, promotedId } = parsed.data
      const rows = await sqlTyped<RecorteRow>(sql`
        UPDATE recortes
        SET status = 'promoted',
            promoted_target = ${target},
            promoted_id = ${promotedId},
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
          AND status <> 'promoted'
        RETURNING id, text, source_url, source_title, source_author, note,
          image_url, status, promoted_target, promoted_id, captured_at,
          created_at, updated_at
      `)
      if (rows.length === 0) {
        return ApiErrors.notFound(requestId, 'Recorte no encontrado o ya promovido')
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
          image_url, status, promoted_target, promoted_id, captured_at,
          created_at, updated_at
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
          captured_at, user_id
        ) VALUES (
          ${b.text}, ${b.sourceUrl ?? null}, ${b.sourceTitle ?? null},
          ${b.sourceAuthor ?? null}, ${b.note ?? null}, ${b.imageUrl ?? null},
          ${b.capturedAt ?? null}::timestamptz, ${userId}
        )
        RETURNING id, text, source_url, source_title, source_author, note,
          image_url, status, promoted_target, promoted_id, captured_at,
          created_at, updated_at
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
            note = CASE WHEN ${b.note !== undefined} THEN ${b.note ?? null} ELSE note END,
            status = CASE
                       WHEN ${b.status === 'archived'} THEN 'archived'
                       WHEN ${b.status === 'pending'} THEN 'pending'
                       ELSE status
                     END,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id, text, source_url, source_title, source_author, note,
          image_url, status, promoted_target, promoted_id, captured_at,
          created_at, updated_at
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
      return Response.json({ ok: true, deletedAt: rows[0]?.deleted_at ?? null })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: [
    '/api/recortes',
    '/api/recortes/:id',
    '/api/recortes/:id/promote',
    '/api/recortes/:id/restore',
    '/api/recortes/:id/suggest',
  ],
}
