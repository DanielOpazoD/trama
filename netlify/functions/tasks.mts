import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { TaskCreateBody, TaskPatchBody } from './_lib/task-schemas.js'
import { parseTags } from './_lib/note-tags.js'

/**
 * Trama Notas — CRUD de Tareas (pendientes livianos). Scope por usuario,
 * soft-delete. Las #etiquetas se derivan de título+detalle (parseTags) al
 * crear y al editar. Orden: pendientes primero, luego por vencimiento (las
 * sin fecha al final) y por recencia. La búsqueda (?q) y el filtro por
 * etiqueta (?tag) son opcionales.
 */
type TaskRow = {
  id: string
  title: string
  detail: string | null
  done: boolean
  due_date: string | null
  priority: string
  week_start: string
  completed_at: string | null
  tags: string[]
  created_at: string
  updated_at: string
}

/** Etiquetas de una tarea: derivadas de título + detalle, juntos. */
function tagsFor(title: string, detail: string | null | undefined): string[] {
  return parseTags(`${title}\n${detail ?? ''}`)
}

export default withObservability(
  'tasks',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const q = url.searchParams.get('q')?.trim()
      const tag = url.searchParams.get('tag')?.trim().toLowerCase()

      if (q) {
        const rows = await sqlTyped<TaskRow>(sql`
          SELECT id, title, detail, done, to_char(due_date, 'YYYY-MM-DD') AS due_date, priority, to_char(week_start, 'YYYY-MM-DD') AS week_start, completed_at, tags, created_at, updated_at
          FROM tasks
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND (title ILIKE ${'%' + q + '%'} OR detail ILIKE ${'%' + q + '%'})
          ORDER BY week_start DESC, done ASC, CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END ASC, created_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      if (tag) {
        const rows = await sqlTyped<TaskRow>(sql`
          SELECT id, title, detail, done, to_char(due_date, 'YYYY-MM-DD') AS due_date, priority, to_char(week_start, 'YYYY-MM-DD') AS week_start, completed_at, tags, created_at, updated_at
          FROM tasks
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND ${tag} = ANY(tags)
          ORDER BY week_start DESC, done ASC, CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END ASC, created_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      const rows = await sqlTyped<TaskRow>(sql`
        SELECT id, title, detail, done, to_char(due_date, 'YYYY-MM-DD') AS due_date, priority, to_char(week_start, 'YYYY-MM-DD') AS week_start, completed_at, tags, created_at, updated_at
        FROM tasks
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY week_start DESC, done ASC, CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END ASC, created_at DESC, id DESC
      `)
      return Response.json(rows)
    }

    if (req.method === 'POST') {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, TaskCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const { title, detail, dueDate, priority, weekStart } = parsed.data
      const tags = tagsFor(title, detail)
      const rows = await sqlTyped<TaskRow>(sql`
        INSERT INTO tasks (title, detail, due_date, priority, week_start, tags, user_id)
        VALUES (
          ${title},
          ${detail ?? null},
          ${dueDate ?? null},
          COALESCE(${priority ?? null}, 'media'),
          COALESCE(${weekStart ?? null}::date, date_trunc('week', NOW())::date),
          ${tags}::text[],
          ${userId}
        )
        RETURNING id, title, detail, done, to_char(due_date, 'YYYY-MM-DD') AS due_date, priority, to_char(week_start, 'YYYY-MM-DD') AS week_start, completed_at, tags, created_at, updated_at
      `)
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, TaskPatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data

      // Si cambió título o detalle, re-derivamos las etiquetas. Necesitamos los
      // valores actuales para el campo que NO vino en el patch.
      let newTags: string[] | null = null
      if (body.title !== undefined || body.detail !== undefined) {
        const current = await sqlTyped<{ title: string; detail: string | null }>(sql`
          SELECT title, detail FROM tasks
          WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        `)
        if (current.length === 0)
          return ApiErrors.notFound(requestId, 'Tarea no encontrada')
        const cur = current[0]!
        newTags = tagsFor(
          body.title ?? cur.title,
          body.detail !== undefined ? body.detail : cur.detail,
        )
      }

      const rows = await sqlTyped<TaskRow>(sql`
        UPDATE tasks
        SET title = COALESCE(${body.title ?? null}, title),
            detail = CASE WHEN ${body.detail !== undefined} THEN ${body.detail ?? null} ELSE detail END,
            due_date = CASE WHEN ${body.dueDate !== undefined} THEN ${body.dueDate ?? null} ELSE due_date END,
            priority = CASE WHEN ${body.priority !== undefined} THEN ${body.priority ?? null} ELSE priority END,
            week_start = CASE WHEN ${body.weekStart !== undefined} THEN ${body.weekStart ?? null}::date ELSE week_start END,
            done = CASE
                     WHEN ${body.done === true} THEN true
                     WHEN ${body.done === false} THEN false
                     ELSE done
                   END,
            completed_at = CASE
                             WHEN ${body.done === true} THEN NOW()
                             WHEN ${body.done === false} THEN NULL
                             ELSE completed_at
                           END,
            tags = CASE WHEN ${newTags !== null} THEN ${newTags ?? []}::text[] ELSE tags END,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id, title, detail, done, to_char(due_date, 'YYYY-MM-DD') AS due_date, priority, to_char(week_start, 'YYYY-MM-DD') AS week_start, completed_at, tags, created_at, updated_at
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Tarea no encontrada')
      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      await sql`
        UPDATE tasks SET deleted_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `
      return Response.json({ ok: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/tasks', '/api/tasks/:id'],
}
