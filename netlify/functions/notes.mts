import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { NoteCreateBody, NotePatchBody } from './_lib/note-schemas.js'
import { parseTags } from './_lib/note-tags.js'
import { embedSafe, toPgVector } from './_lib/embeddings.js'
import { momentoEmbedText } from './_lib/momento-embed.js'

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
  has_images: boolean
}

export default withObservability(
  'notes',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id

    // τ-worlds Fase 4: promover una nota → Momento (kind=nota). Crea el
    // Momento con el contenido de la nota (embedding best-effort, en la fecha
    // de la nota) y marca `promoted_momento_id` para no duplicar. Es el puente
    // entre el mundo Notas y el mapa.
    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/promote')) {
      const rows = await sqlTyped<{
        content: string
        promoted: string | null
        created_at: string
      }>(sql`
        SELECT content, promoted_momento_id AS promoted, created_at
        FROM notes
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Nota no encontrada')
      const note = rows[0]!
      if (note.promoted) {
        return ApiErrors.validation(requestId, 'Esta nota ya fue promovida a un Momento')
      }

      await ensureUserRow(sql, authedUser)

      const payload = { bodyText: note.content }
      const embedSource = momentoEmbedText('nota', payload, null)
      const emb = embedSource.length > 0 ? await embedSafe(embedSource) : null
      const inserted = await sqlTyped<{ id: string }>(sql`
        INSERT INTO momentos (
          kind, captured_at, payload, note, origin,
          embedding, embedding_model, embedding_at, user_id
        ) VALUES (
          'nota',
          ${note.created_at}::timestamptz,
          ${JSON.stringify(payload)}::jsonb,
          ${null},
          ${JSON.stringify({ kind: 'manual' })}::jsonb,
          ${emb ? toPgVector(emb.vector) : null}::vector,
          ${emb?.model ?? null},
          ${emb ? new Date().toISOString() : null}::timestamptz,
          ${userId}
        )
        RETURNING id
      `)
      const momentoId = inserted[0]?.id
      if (!momentoId) return ApiErrors.internal(requestId, 'No se pudo crear el Momento')

      await sql`
        UPDATE notes
        SET promoted_momento_id = ${momentoId}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId}
      `
      return Response.json({ momentoId }, { status: 201 })
    }

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const q = url.searchParams.get('q')?.trim()
      const tag = url.searchParams.get('tag')?.trim().toLowerCase()

      if (q) {
        const rows = await sqlTyped<NoteRow>(sql`
          SELECT id, content, tags, pinned, promoted_momento_id, created_at, updated_at, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'image/%' AND na.deleted_at IS NULL) AS has_images
          FROM notes
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND content ILIKE ${'%' + q + '%'}
          ORDER BY pinned DESC, created_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      if (tag) {
        const rows = await sqlTyped<NoteRow>(sql`
          SELECT id, content, tags, pinned, promoted_momento_id, created_at, updated_at, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'image/%' AND na.deleted_at IS NULL) AS has_images
          FROM notes
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND ${tag} = ANY(tags)
          ORDER BY pinned DESC, created_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      const rows = await sqlTyped<NoteRow>(sql`
        SELECT id, content, tags, pinned, promoted_momento_id, created_at, updated_at, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'image/%' AND na.deleted_at IS NULL) AS has_images
        FROM notes
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY pinned DESC, created_at DESC, id DESC
      `)
      return Response.json(rows)
    }

    if (req.method === 'POST') {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, NoteCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const { content, pinned } = parsed.data
      const tags = parseTags(content)
      const rows = await sqlTyped<NoteRow>(sql`
        INSERT INTO notes (content, tags, pinned, user_id)
        VALUES (${content}, ${tags}::text[], ${pinned ?? false}, ${userId})
        RETURNING id, content, tags, pinned, promoted_momento_id, created_at, updated_at, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'image/%' AND na.deleted_at IS NULL) AS has_images
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
        RETURNING id, content, tags, pinned, promoted_momento_id, created_at, updated_at, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'image/%' AND na.deleted_at IS NULL) AS has_images
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Nota no encontrada')
      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      await sql`
        UPDATE notes SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `
      await sql`
        UPDATE notas_attachments SET deleted_at = NOW(), updated_at = NOW()
        WHERE owner_type = 'note' AND owner_id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      `
      return Response.json({ ok: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/notes', '/api/notes/:id', '/api/notes/:id/promote'],
}
