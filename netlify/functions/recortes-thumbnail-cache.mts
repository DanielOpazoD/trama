import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { storeRecorteImage } from './_lib/recortes-media.js'
import { downloadThumbnail, resolveThumbnailUrl } from './_lib/recortes-thumbnail.js'

/**
 * POST /api/recortes/:id/cache-thumbnail
 *
 * Cachea la miniatura de un recorte-enlace en NUESTRO blob propio
 * (`recortes-media`) en vez de depender de una URL externa (i.ytimg.com, host
 * del og:image). Flujo:
 *   1. Resuelve el recorte (auth + ownership + soft-delete). Si ya tiene
 *      `image_key`, no hace nada (idempotente, no re-descarga).
 *   2. Decide la URL de miniatura: la derivada de YouTube (si el source es un
 *      video) o el `image_url` que dejó el enriquecimiento OG.
 *   3. Descarga los bytes con el fetch endurecido contra SSRF (cap de tamaño,
 *      solo content-type image/*).
 *   4. Guarda los bytes en `recortes-media` y PATCHea el recorte con la
 *      `image_key` nueva (limpia `image_url`: ya no dependemos de la externa).
 *
 * Best-effort: cualquier paso que no dé fruto devuelve `{ cached: false }` con
 * 200 — el recorte queda como estaba y el cliente sigue mostrando la externa /
 * la miniatura derivada. NUNCA bloquea ni rompe el flujo del usuario.
 */

type RecorteThumbRow = {
  source_url: string | null
  image_url: string | null
  image_key: string | null
}

export default withObservability(
  'recortes-thumbnail-cache',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }
    const id = context.params.id
    if (!id) return ApiErrors.validation(requestId, 'Falta el id del recorte')

    const { id: userId } = await getAuthedUser(req)
    const sql = getSql()

    // Ownership + soft-delete en la query (no filtramos por status: un recorte
    // ya promovido/archivado puede igual ganar su miniatura propia).
    const rows = await sqlTyped<RecorteThumbRow>(sql`
      SELECT source_url, image_url, image_key
      FROM recortes
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
    `)
    const recorte = rows[0]
    if (!recorte) return ApiErrors.notFound(requestId, 'Recorte no encontrado')

    // Idempotente: si ya tiene blob propio, no re-descargamos.
    if (recorte.image_key) {
      return Response.json({ cached: false, reason: 'already-cached' })
    }

    const thumbUrl = resolveThumbnailUrl(recorte.source_url, recorte.image_url)
    if (!thumbUrl) {
      return Response.json({ cached: false, reason: 'no-thumbnail' })
    }

    const downloaded = await downloadThumbnail(thumbUrl)
    if (!downloaded) {
      return Response.json({ cached: false, reason: 'download-failed' })
    }

    let imageKey: string
    try {
      imageKey = await storeRecorteImage(userId, downloaded.bytes, downloaded.mime)
    } catch {
      return Response.json({ cached: false, reason: 'store-failed' })
    }

    // PATCH: set image_key, y limpiamos image_url (ya servimos del blob propio).
    // Re-chequeamos ownership + que siga sin image_key (carrera con otra
    // pestaña): si otra ya cacheó, no pisamos.
    const updated = await sqlTyped<{ image_key: string | null }>(sql`
      UPDATE recortes
      SET image_key = ${imageKey}, image_url = NULL, updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        AND image_key IS NULL
      RETURNING image_key
    `)
    if (updated.length === 0) {
      // Otra carrera ganó o el recorte desapareció: el blob queda huérfano
      // (lo recoge el GC de blobs); no es un error para el usuario.
      return Response.json({ cached: false, reason: 'patch-skipped' })
    }

    return Response.json({ cached: true, imageKey })
  },
)

export const config: Config = {
  path: '/api/recortes/:id/cache-thumbnail',
}
