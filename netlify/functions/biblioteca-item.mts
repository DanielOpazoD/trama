import type { Config, Context } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { z } from 'zod'
import {
  DISPLAY_TITLE_MAX,
  ITEM_ID_MAX,
  LIBRARY_ITEM_KINDS,
  LibraryOverrideValidationError,
  TAG_MAX,
  TAGS_MAX,
  renameLibraryItem,
  setLibraryItemDeleted,
  setLibraryItemPinned,
  setLibraryItemTags,
} from './_lib/library-overrides.js'

/**
 * Biblioteca — acciones sobre un item (PR4). Escribe en `library_item_overrides`
 * (la capa decoradora) sin tocar el blob ni la fila nativa:
 *
 *   PATCH /api/biblioteca-item/:kind/:id
 *     { displayTitle }      → renombrar (upsert display_title)
 *     { deleted: boolean }  → papelera (true) / restaurar (false)
 *     { tags: string[] }    → reemplazar etiquetas (upsert tags)
 *     { pinned: boolean }   → fijar (true) / soltar (false)
 *
 * El lado GET no vive acá: la lista (y la papelera, vía `incluyeEliminados`) la
 * sirve `GET /api/biblioteca` con el read-model que ya aplica overrides. Acá solo
 * mutamos. La lógica pura (validación + upsert) vive en el servicio de dominio
 * `_lib/library-overrides.ts`; este handler coordina auth, parseo y Response.
 */

/** `:kind` debe ser uno de los 6 item_kind admitidos (espejo del CHECK SQL). */
const ItemKindParam = z.enum(LIBRARY_ITEM_KINDS)

/**
 * Body del PATCH: una sola acción por request. Union de cuatro formas:
 * renombrar (`displayTitle` 1..400), papelera (`deleted`), etiquetas (`tags`,
 * cada una 1..TAG_MAX, hasta TAGS_MAX; la normalización fina vive en el dominio)
 * o fijado (`pinned`). El handler discrimina por la clave presente.
 */
const BibliotecaItemPatchBody = z.union([
  // `strictObject` rechaza payloads con claves extra: así `{ displayTitle,
  // deleted }` (dos acciones a la vez) falla la validación en vez de ejecutar
  // una en silencio — refuerza el contrato de "una sola acción por request".
  z.strictObject({
    displayTitle: z.string().trim().min(1).max(DISPLAY_TITLE_MAX),
  }),
  z.strictObject({
    deleted: z.boolean(),
  }),
  z.strictObject({
    tags: z.array(z.string().trim().min(1).max(TAG_MAX)).max(TAGS_MAX),
  }),
  z.strictObject({
    pinned: z.boolean(),
  }),
])

export default withObservability(
  'biblioteca-item',
  async (req: Request, context: Context, { requestId }) => {
    const { id: userId } = await getAuthedUser(req, {
      requestId,
      operation: `biblioteca-item.${req.method.toLowerCase()}`,
    })
    const sql = getSql()

    if (req.method !== 'PATCH') return ApiErrors.methodNotAllowed(requestId)

    // `:kind` / `:id` vienen del path (config.path). Validamos kind contra el
    // enum y la longitud de id antes de tocar SQL.
    const kindResult = ItemKindParam.safeParse(context.params.kind)
    if (!kindResult.success) {
      return ApiErrors.validation(requestId, 'Tipo de item no válido')
    }
    const itemId = context.params.id ?? ''
    if (itemId.length < 1 || itemId.length > ITEM_ID_MAX) {
      return ApiErrors.validation(requestId, 'Identificador de item no válido')
    }

    const parsed = await parseJsonBody(req, BibliotecaItemPatchBody, requestId)
    if (!parsed.ok) return parsed.response
    const body = parsed.data

    try {
      if ('displayTitle' in body) {
        const row = await renameLibraryItem(sql, {
          userId,
          itemKind: kindResult.data,
          itemId,
          displayTitle: body.displayTitle,
        })
        return Response.json({
          ok: true,
          kind: kindResult.data,
          itemId,
          title: row?.display_title ?? body.displayTitle.trim(),
        })
      }

      if ('tags' in body) {
        const row = await setLibraryItemTags(sql, {
          userId,
          itemKind: kindResult.data,
          itemId,
          tags: body.tags,
        })
        return Response.json({
          ok: true,
          kind: kindResult.data,
          itemId,
          tags: row?.tags ?? body.tags,
        })
      }

      if ('pinned' in body) {
        const row = await setLibraryItemPinned(sql, {
          userId,
          itemKind: kindResult.data,
          itemId,
          pinned: body.pinned,
        })
        return Response.json({
          ok: true,
          kind: kindResult.data,
          itemId,
          pinned: row?.pinned ?? body.pinned,
        })
      }

      await setLibraryItemDeleted(sql, {
        userId,
        itemKind: kindResult.data,
        itemId,
        deleted: body.deleted,
      })
      return Response.json({
        ok: true,
        kind: kindResult.data,
        itemId,
        deleted: body.deleted,
      })
    } catch (err) {
      if (err instanceof LibraryOverrideValidationError) {
        return ApiErrors.validation(requestId, err.message)
      }
      throw err
    }
  },
)

export const config: Config = {
  path: ['/api/biblioteca-item/:kind/:id'],
}
