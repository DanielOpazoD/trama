import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { NoteCreateBody, NotePatchBody } from './_lib/note-schemas.js'
import { parseTags } from './_lib/note-tags.js'

/**
 * Trama Notas — CRUD de apuntes rápidos (memos). Scope por usuario,
 * soft-delete. Las #etiquetas se derivan del contenido (parseTags) al crear
 * y al editar. La búsqueda (?q) y el filtro por etiqueta (?tag) son opcionales
 * — sin ellos devuelve todas las notas del usuario, fijadas primero.
 */
type NoteRow = {
  id: string
  content: string
  tags: string[]
  pinned: boolean
  promoted_momento_id: string | null
  created_at: string
  updated_at: string
}

export default withObservability(
  'notes',
  async (req: Request, context: Context, { requestId }) => {
    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()
    const id = context.params.id

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const q = url.searchParams.get('q')?.trim()
      const tag = url.searchParams.get('tag')?.trim().toLowerCase()

      if (q) {
        const rows = await sqlTyped<NoteRow>(sql`
          SELECT id, content, tags, pinned, promoted_momento_id, created_at, updated_at
          FROM notes
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND content ILIKE ${'%' + q + '%'}
          ORDER BY pinned DESC, created_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      if (tag) {
        const rows = await sqlTyped<NoteRow>(sql`
          SELECT id, content, tags, pinned, promoted_momento_id, created_at, updated_at
          FROM notes
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND ${tag} = ANY(tags)
          ORDER BY pinned DESC, created_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      const rows = await sqlTyped<NoteRow>(sql`
        SELECT id, content, tags, pinned, promoted_momento_id, created_at, updated_at
        FROM notes
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY pinned DESC, created_at DESC, id DESC
      `)
      return Response.json(rows)
    }

    if (req.method === 'POST') {
      const parsed = await parseJsonBody(req, NoteCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const { content, pinned } = parsed.data
      const tags = parseTags(content)
      const rows = await sqlTyped<NoteRow>(sql`
        INSERT INTO notes (content, tags, pinned, user_id)
        VALUES (${content}, ${tags}::text[], ${pinned ?? false}, ${userId})
        RETURNING id, content, tags, pinned, promoted_momento_id, created_at, updated_at
      `)
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, NotePatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data
      // Si cambió el contenido, re-derivamos las etiquetas.
      const newTags = body.content !== undefined ? parseTags(body.content) : null
      const rows = await sqlTyped<NoteRow>(sql`
        UPDATE notes
        SET content = COALESCE(${body.content ?? null}, content),
            tags = CASE WHEN ${newTags !== null} THEN ${newTags ?? []}::text[] ELSE tags END,
            pinned = CASE
                       WHEN ${body.pinned === true} THEN true
                       WHEN ${body.pinned === false} THEN false
                       ELSE pinned
                     END,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id, content, tags, pinned, promoted_momento_id, created_at, updated_at
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Nota no encontrada')
      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      await sql`
        UPDATE notes SET deleted_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `
      return Response.json({ ok: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/notes', '/api/notes/:id'],
}
