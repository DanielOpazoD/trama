import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { PromptCreateBody, PromptPatchBody } from './_lib/prompt-schemas.js'
import { RestoreBody } from './_lib/restore-schema.js'
import { extractPromptVariables } from './_lib/prompt-vars.js'
import {
  applyPromptPatch,
  listPromptVersions,
  readPromptVersion,
  tagsFor,
} from './_lib/prompt-versions.js'

type PromptRow = {
  id: string
  title: string
  content: string
  collection: string | null
  tags: string[]
  variables: string[]
  favorite: boolean
  use_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export default withObservability(
  'prompts',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    const id = context.params.id
    const versionId = context.params.versionId
    const pathname = new URL(req.url).pathname

    if (req.method === 'GET' && id && pathname.endsWith('/versions')) {
      const versions = await listPromptVersions(sql, userId, id)
      return Response.json(versions)
    }

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const q = url.searchParams.get('q')?.trim()
      const collection = url.searchParams.get('collection')?.trim()
      const tag = url.searchParams.get('tag')?.trim().toLowerCase()

      if (q) {
        const rows = await sqlTyped<PromptRow>(sql`
          SELECT id, title, content, collection, tags, variables, favorite, use_count, last_used_at, created_at, updated_at
          FROM prompts
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND (title ILIKE ${'%' + q + '%'} OR content ILIKE ${'%' + q + '%'})
          ORDER BY favorite DESC, updated_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      if (collection) {
        const rows = await sqlTyped<PromptRow>(sql`
          SELECT id, title, content, collection, tags, variables, favorite, use_count, last_used_at, created_at, updated_at
          FROM prompts
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND collection = ${collection}
          ORDER BY favorite DESC, updated_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      if (tag) {
        const rows = await sqlTyped<PromptRow>(sql`
          SELECT id, title, content, collection, tags, variables, favorite, use_count, last_used_at, created_at, updated_at
          FROM prompts
          WHERE deleted_at IS NULL AND user_id = ${userId}
            AND ${tag} = ANY(tags)
          ORDER BY favorite DESC, updated_at DESC, id DESC
        `)
        return Response.json(rows)
      }
      const rows = await sqlTyped<PromptRow>(sql`
        SELECT id, title, content, collection, tags, variables, favorite, use_count, last_used_at, created_at, updated_at
        FROM prompts
        WHERE deleted_at IS NULL AND user_id = ${userId}
        ORDER BY favorite DESC, updated_at DESC, id DESC
      `)
      return Response.json(rows)
    }

    // Deshacer del DELETE: restaura el prompt + sus anexos que cayeron en la
    // MISMA pasada (mismo deleted_at), en un único CTE atómico.
    //
    // `!versionId` no es decorativo: restaurar una VERSIÓN también termina en
    // `/restore`, así que sin esto esta rama se comería esa ruta y el orden de
    // los `if` pasaría a ser significativo sin que nada lo dijera.
    if (req.method === 'POST' && id && !versionId && pathname.endsWith('/restore')) {
      const parsed = await parseJsonBody(req, RestoreBody, requestId)
      if (!parsed.ok) return parsed.response
      const { deletedAt } = parsed.data
      const rows = await sqlTyped<{ restored: boolean }>(sql`
        WITH restore_prompt AS (
          UPDATE prompts SET deleted_at = NULL, updated_at = NOW()
          WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
          RETURNING 1
        ),
        restore_attachments AS (
          UPDATE notas_attachments SET deleted_at = NULL, updated_at = NOW()
          WHERE owner_type = 'prompt' AND owner_id = ${id}
            AND deleted_at = ${deletedAt} AND user_id = ${userId}
            AND EXISTS (SELECT 1 FROM restore_prompt)
          RETURNING 1
        )
        SELECT EXISTS (SELECT 1 FROM restore_prompt) AS restored
      `)
      if (!rows[0]?.restored) {
        return ApiErrors.notFound(requestId, 'Prompt no encontrado para restaurar')
      }
      return Response.json({ restored: true })
    }

    // Restaurar una versión es una edición más y pasa por el mismo camino de
    // escritura, así que guarda antes lo que había: se puede ir y volver sin
    // perder ninguno de los dos textos.
    if (req.method === 'POST' && id && versionId && pathname.endsWith('/restore')) {
      const version = await readPromptVersion(sql, userId, id, versionId)
      if (!version) return ApiErrors.notFound(requestId, 'Versión no encontrada')
      const row = await applyPromptPatch(sql, userId, id, version)
      if (!row) return ApiErrors.notFound(requestId, 'Prompt no encontrado')
      return Response.json(row)
    }

    if (req.method === 'POST' && id && pathname.endsWith('/duplicate')) {
      await ensureUserRow(sql, authedUser)
      const rows = await sqlTyped<PromptRow>(sql`
        INSERT INTO prompts (title, content, collection, tags, variables, favorite, user_id)
        SELECT title || ' copia', content, collection, tags, variables, false, user_id
        FROM prompts
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id, title, content, collection, tags, variables, favorite, use_count, last_used_at, created_at, updated_at
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Prompt no encontrado')
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'POST' && id && pathname.endsWith('/use')) {
      const rows = await sqlTyped<PromptRow>(sql`
        UPDATE prompts
        SET use_count = use_count + 1,
            last_used_at = NOW(),
            updated_at = NOW()
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        RETURNING id, title, content, collection, tags, variables, favorite, use_count, last_used_at, created_at, updated_at
      `)
      if (rows.length === 0) return ApiErrors.notFound(requestId, 'Prompt no encontrado')
      return Response.json(rows[0])
    }

    if (req.method === 'POST') {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, PromptCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const { title, content, collection, favorite } = parsed.data
      const tags = tagsFor({ title, content, collection: collection ?? null })
      const variables = extractPromptVariables(content)
      const rows = await sqlTyped<PromptRow>(sql`
        INSERT INTO prompts (title, content, collection, tags, variables, favorite, user_id)
        VALUES (${title}, ${content}, ${collection ?? null}, ${tags}::text[], ${variables}::text[], ${favorite ?? false}, ${userId})
        RETURNING id, title, content, collection, tags, variables, favorite, use_count, last_used_at, created_at, updated_at
      `)
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, PromptPatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const row = await applyPromptPatch(sql, userId, id, parsed.data)
      if (!row) return ApiErrors.notFound(requestId, 'Prompt no encontrado')
      return Response.json(row)
    }

    if (req.method === 'DELETE' && id) {
      // Un solo CTE: prompt y anexos comparten el MISMO deleted_at (antes eran
      // dos UPDATEs con NOW() distintos). Devuelve el timestamp para Deshacer.
      const rows = await sqlTyped<{ deleted_at: string }>(sql`
        WITH del_prompt AS (
          UPDATE prompts SET deleted_at = NOW(), updated_at = NOW()
          WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
          RETURNING deleted_at
        ),
        del_attachments AS (
          UPDATE notas_attachments
          SET deleted_at = (SELECT deleted_at FROM del_prompt), updated_at = NOW()
          WHERE owner_type = 'prompt' AND owner_id = ${id}
            AND deleted_at IS NULL AND user_id = ${userId}
            AND EXISTS (SELECT 1 FROM del_prompt)
          RETURNING 1
        )
        SELECT deleted_at FROM del_prompt
      `)
      return Response.json({ ok: true, deletedAt: rows[0]?.deleted_at ?? null })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: [
    '/api/prompts',
    '/api/prompts/:id',
    '/api/prompts/:id/duplicate',
    '/api/prompts/:id/use',
    '/api/prompts/:id/restore',
    '/api/prompts/:id/versions',
    '/api/prompts/:id/versions/:versionId/restore',
  ],
}
