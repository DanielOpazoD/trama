import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { z } from 'zod'
import {
  ITEM_ID_MAX,
  LIBRARY_ITEM_KINDS,
  LibraryOverrideValidationError,
} from './_lib/library-overrides.js'
import {
  LINK_TARGET_KINDS,
  TARGET_ID_MAX,
  linkLibraryItem,
  listLibraryItemLinks,
  unlinkLibraryItem,
} from './_lib/library-links.js'

/**
 * Biblioteca — conexiones de un item con objetos de dominio (PR-C). Opera sobre
 * `library_item_links` (junction con soft-delete) sin tocar el blob ni el destino:
 *
 *   GET    /api/biblioteca-links/:kind/:id                       → lista vínculos
 *   POST   /api/biblioteca-links/:kind/:id { targetKind,targetId } → crea/revive
 *   DELETE /api/biblioteca-links/:kind/:id?targetKind=&targetId=  → quita (soft)
 *
 * La lógica pura (validación + queries) vive en `_lib/library-links.ts`; este
 * handler coordina auth, parseo y Response, y mapea la fila a camelCase.
 */

const ItemKindParam = z.enum(LIBRARY_ITEM_KINDS)

/** Body del POST: destino a vincular. */
const LinkBody = z.object({
  targetKind: z.enum(LINK_TARGET_KINDS),
  targetId: z.string().trim().min(1).max(TARGET_ID_MAX),
})

export default withObservability(
  'biblioteca-links',
  async (req: Request, context: Context, { requestId }) => {
    const { id: userId } = await getAuthedUser(req, {
      requestId,
      operation: `biblioteca-links.${req.method.toLowerCase()}`,
    })
    const sql = getSql()

    // `:kind` / `:id` del path: kind contra el enum, longitud de id acotada.
    const kindResult = ItemKindParam.safeParse(context.params.kind)
    if (!kindResult.success) {
      return ApiErrors.validation(requestId, 'Tipo de item no válido')
    }
    const itemId = context.params.id ?? ''
    if (itemId.length < 1 || itemId.length > ITEM_ID_MAX) {
      return ApiErrors.validation(requestId, 'Identificador de item no válido')
    }

    try {
      if (req.method === 'GET') {
        const links = await listLibraryItemLinks(sql, {
          userId,
          itemKind: kindResult.data,
          itemId,
        })
        return Response.json({
          links: links.map((l) => ({
            id: l.id,
            targetKind: l.target_kind,
            targetId: l.target_id,
            targetTitle: l.target_title,
            createdAt: l.created_at,
          })),
        })
      }

      if (req.method === 'POST') {
        const parsed = await parseJsonBody(req, LinkBody, requestId)
        if (!parsed.ok) return parsed.response
        await linkLibraryItem(sql, {
          userId,
          itemKind: kindResult.data,
          itemId,
          targetKind: parsed.data.targetKind,
          targetId: parsed.data.targetId,
        })
        return Response.json({ ok: true })
      }

      if (req.method === 'DELETE') {
        const url = new URL(req.url)
        await unlinkLibraryItem(sql, {
          userId,
          itemKind: kindResult.data,
          itemId,
          targetKind: url.searchParams.get('targetKind') ?? '',
          targetId: url.searchParams.get('targetId') ?? '',
        })
        return Response.json({ ok: true })
      }

      return ApiErrors.methodNotAllowed(requestId)
    } catch (err) {
      if (err instanceof LibraryOverrideValidationError) {
        return ApiErrors.validation(requestId, err.message)
      }
      throw err
    }
  },
)

export const config: Config = {
  path: ['/api/biblioteca-links/:kind/:id'],
}
