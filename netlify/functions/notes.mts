import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { parseSearchParams, QueryParam } from './_lib/request-contracts.js'
import { NoteCreateBody, NotePatchBody } from './_lib/note-schemas.js'
import { RestoreBody } from './_lib/restore-schema.js'
import { parseTags } from './_lib/note-tags.js'
import { embedSafe, toPgVector } from './_lib/embeddings.js'
import { momentoEmbedText } from './_lib/momento-embed.js'
import { parseRows } from './_lib/row-parse.js'
import { NoteRowSchema, type NoteRow } from './_lib/backend-row-schemas.js'
import { z } from 'zod'

/**
 * Trama Notas — CRUD de apuntes rápidos (memos). Scope por usuario,
 * soft-delete. Las #etiquetas se derivan del contenido (parseTags) al crear
 * y al editar. La búsqueda (?q) y el filtro por etiqueta (?tag) son opcionales
 * — sin ellos devuelve todas las notas del usuario, fijadas primero.
 */
const NoteListQuery = z.object({
  q: z.preprocess(QueryParam.trimmedString({ max: 500 }).normalize, z.string().max(500)),
  tag: z.preprocess(
    QueryParam.trimmedString({ max: 100 }).normalize,
    z
      .string()
      .max(100)
      .transform((value) => value.toLowerCase()),
  ),
})

/** Título corto opcional: recorta espacios y vacío → null. */
function normalizeTitle(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 200) : null
}

export default withObservability(
  'notes',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req, {
      requestId,
      operation: `notes.${req.method.toLowerCase()}`,
    })
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
      // Promoción atómica: crear el Momento y marcar la nota en UN solo CTE, para
      // que el Lambda no pueda morir entre ambos y dejar un Momento huérfano (la
      // nota sin su promoted_momento_id). El INSERT se condiciona a que la nota
      // siga válida y sin promover, cerrando la ventana de carrera contra el
      // SELECT previo. Si nada se insertó, otra request la promovió en paralelo.
      // (mutación multi-tabla → CTE, docs/conventions/dominios.md; regresión en
      //  scripts/check-cte-regression.sql)
      const promoted = await sqlTyped<{ momento_id: string | null }>(sql`
        WITH new_momento AS (
          INSERT INTO momentos (
            kind, captured_at, payload, note, origin,
            embedding, embedding_model, embedding_at, user_id
          )
          SELECT
            'nota',
            ${note.created_at}::timestamptz,
            ${JSON.stringify(payload)}::jsonb,
            ${null},
            ${JSON.stringify({ kind: 'manual' })}::jsonb,
            ${emb ? toPgVector(emb.vector) : null}::vector,
            ${emb?.model ?? null},
            ${emb ? new Date().toISOString() : null}::timestamptz,
            ${userId}
          WHERE EXISTS (
            SELECT 1 FROM notes
            WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
              AND promoted_momento_id IS NULL
          )
          RETURNING id
        ),
        mark AS (
          UPDATE notes
          SET promoted_momento_id = (SELECT id FROM new_momento), updated_at = NOW()
          WHERE id = ${id} AND user_id = ${userId} AND EXISTS (SELECT 1 FROM new_momento)
          RETURNING id
        )
        SELECT (SELECT id FROM new_momento) AS momento_id
      `)
      const momentoId = promoted[0]?.momento_id
      if (!momentoId) {
        return ApiErrors.validation(requestId, 'Esta nota ya fue promovida a un Momento')
      }
      return Response.json({ momentoId }, { status: 201 })
    }

    // Deshacer del DELETE: restaura la nota + los anexos que cayeron en la
    // MISMA pasada (mismo deleted_at), en un único CTE atómico.
    if (req.method === 'POST' && id && new URL(req.url).pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, RestoreBody, requestId)
      if (!parsed.ok) return parsed.response
      const { deletedAt } = parsed.data
      const rows = await sqlTyped<{ restored: boolean }>(sql`
        WITH restore_note AS (
          UPDATE notes SET deleted_at = NULL, updated_at = NOW()
          WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
          RETURNING 1
        ),
        restore_attachments AS (
          UPDATE notas_attachments SET deleted_at = NULL, updated_at = NOW()
          WHERE owner_type = 'note' AND owner_id = ${id}
            AND deleted_at = ${deletedAt} AND user_id = ${userId}
            AND EXISTS (SELECT 1 FROM restore_note)
          RETURNING 1
        )
        SELECT EXISTS (SELECT 1 FROM restore_note) AS restored
      `)
      if (!rows[0]?.restored) {
        return ApiErrors.notFound(requestId, 'Nota no encontrada para restaurar')
      }
      return Response.json({ restored: true })
    }

    if (req.method === 'GET') {
      const parsedQuery = parseSearchParams(req, NoteListQuery, requestId)
      if (!parsedQuery.ok) return parsedQuery.response
      const { q, tag } = parsedQuery.data

      if (q) {
        const rows = parseRows(
          await sqlTyped<NoteRow>(sql`
          SELECT id, content, title, tags, pinned, promoted_momento_id, source, created_at, updated_at, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'image/%' AND na.deleted_at IS NULL) AS has_images, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'audio/%' AND na.deleted_at IS NULL) AS has_audio
          FROM notes
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND (content ILIKE ${'%' + q + '%'} OR title ILIKE ${'%' + q + '%'})
          ORDER BY pinned DESC, created_at DESC, id DESC
        `),
          NoteRowSchema,
          'notes.list.search',
        )
        return Response.json(rows)
      }
      if (tag) {
        const rows = parseRows(
          await sqlTyped<NoteRow>(sql`
          SELECT id, content, title, tags, pinned, promoted_momento_id, source, created_at, updated_at, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'image/%' AND na.deleted_at IS NULL) AS has_images, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'audio/%' AND na.deleted_at IS NULL) AS has_audio
          FROM notes
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND ${tag} = ANY(tags)
          ORDER BY pinned DESC, created_at DESC, id DESC
        `),
          NoteRowSchema,
          'notes.list.tag',
        )
        return Response.json(rows)
      }
      const rows = parseRows(
        await sqlTyped<NoteRow>(sql`
        SELECT id, content, title, tags, pinned, promoted_momento_id, source, created_at, updated_at, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'image/%' AND na.deleted_at IS NULL) AS has_images, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'audio/%' AND na.deleted_at IS NULL) AS has_audio
        FROM notes
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY pinned DESC, created_at DESC, id DESC
      `),
        NoteRowSchema,
        'notes.list.all',
      )
      return Response.json(rows)
    }

    if (req.method === 'POST') {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, NoteCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const { content, pinned } = parsed.data
      const title = normalizeTitle(parsed.data.title)
      const tags = parseTags(content)
      const rows = parseRows(
        await sqlTyped<NoteRow>(sql`
        INSERT INTO notes (content, title, tags, pinned, user_id)
        VALUES (${content}, ${title}, ${tags}::text[], ${pinned ?? false}, ${userId})
        RETURNING id, content, title, tags, pinned, promoted_momento_id, source, created_at, updated_at, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'image/%' AND na.deleted_at IS NULL) AS has_images, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'audio/%' AND na.deleted_at IS NULL) AS has_audio
      `),
        NoteRowSchema,
        'notes.create.returning',
      )
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, NotePatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data
      // Si cambió el contenido, re-derivamos las etiquetas.
      const newTags = body.content !== undefined ? parseTags(body.content) : null
      const rows = parseRows(
        await sqlTyped<NoteRow>(sql`
        UPDATE notes
        SET content = COALESCE(${body.content ?? null}, content),
            title = CASE
                      WHEN ${body.title !== undefined} THEN ${normalizeTitle(body.title)}
                      ELSE title
                    END,
            tags = CASE WHEN ${newTags !== null} THEN ${newTags ?? []}::text[] ELSE tags END,
            pinned = CASE
                       WHEN ${body.pinned === true} THEN true
                       WHEN ${body.pinned === false} THEN false
                       ELSE pinned
                     END,
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id, content, title, tags, pinned, promoted_momento_id, source, created_at, updated_at, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'image/%' AND na.deleted_at IS NULL) AS has_images, EXISTS(SELECT 1 FROM notas_attachments na WHERE na.user_id = notes.user_id AND na.owner_type = 'note' AND na.owner_id = notes.id::text AND na.mime_type LIKE 'audio/%' AND na.deleted_at IS NULL) AS has_audio
      `),
        NoteRowSchema,
        'notes.patch.returning',
      )
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Nota no encontrada')
      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      // Un solo CTE: la nota y sus anexos comparten el MISMO deleted_at (antes
      // eran dos UPDATEs con NOW() distintos — ni atómico ni restaurable en
      // bloque). Devuelve el timestamp para que el cliente ofrezca Deshacer.
      const rows = await sqlTyped<{ deleted_at: string }>(sql`
        WITH del_note AS (
          UPDATE notes SET deleted_at = NOW(), updated_at = NOW()
          WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
          RETURNING deleted_at
        ),
        del_attachments AS (
          UPDATE notas_attachments
          SET deleted_at = (SELECT deleted_at FROM del_note), updated_at = NOW()
          WHERE owner_type = 'note' AND owner_id = ${id}
            AND deleted_at IS NULL AND user_id = ${userId}
            AND EXISTS (SELECT 1 FROM del_note)
          RETURNING 1
        )
        SELECT deleted_at FROM del_note
      `)
      if (!rows[0]?.deleted_at) return ApiErrors.notFound(requestId, 'Nota no encontrada')
      return Response.json({ ok: true, deletedAt: rows[0].deleted_at })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: [
    '/api/notes',
    '/api/notes/:id',
    '/api/notes/:id/promote',
    '/api/notes/:id/restore',
  ],
}
