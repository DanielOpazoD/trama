import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { getSql } from './_lib/db.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { isR2Configured, presignPut } from './_lib/r2.js'
import {
  isAllowedMomentoMime,
  momentoExtensionFor,
  R2_KEY_MARKER,
  UNSUPPORTED_MOMENTO_MIME,
} from './_lib/momentos-media-mime.js'

/**
 * POST /api/momentos-uploads-presign
 *
 * Paso 1 de la subida DIRECTA a R2 para media de Momentos. Espeja
 * `library-uploads-presign`, que resolvió lo mismo para la Biblioteca.
 *
 * **Por qué existe.** `momentos-upload` (multipart) topa en 10 MB porque el body
 * atraviesa una Netlify Function. Un video de teléfono pasa de eso en segundos,
 * así que "Momentos acepta video" era cierto solo para clips diminutos. Acá el
 * archivo va DERECHO al bucket y la función solo firma la URL.
 *
 *   1. (acá) El cliente pide una URL presignada para PUTear.
 *   2. `PUT uploadUrl` con el archivo crudo — cross-origin, sin pasar por
 *      ninguna función, así que sin el tope de body.
 *   3. `POST /api/momentos-uploads-complete` verifica que el objeto llegó y lo
 *      registra en `storage_assets`.
 *
 * **La key la elige el servidor, nunca el cliente**, y va namespaceada por
 * `userId` — es lo único que autoriza el endpoint que sirve. Lleva además el
 * marcador `r2-` para que `momentos-file` sepa de dónde leer sin consultar la
 * base en cada miniatura; ver `_lib/momentos-media-mime.ts`.
 */

/** Tope generoso: R2 no tiene el límite de body de las funciones. 200 MB cubre
 *  videos de teléfono sin permitir abusos (mismo criterio que la Biblioteca). */
const MAX_BYTES = 200 * 1024 * 1024

function randomKey(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

const PresignBody = z.object({
  mimeType: z.string().trim().min(1).max(160),
  byteSize: z.number().int().nonnegative().max(MAX_BYTES),
})

export default withObservability(
  'momentos-uploads-presign',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') return ApiErrors.methodNotAllowed(requestId)

    const authedUser = await getAuthedUser(req, {
      requestId,
      operation: 'momentos-upload.presign',
    })
    const userId = authedUser.id
    const sql = getSql()
    await ensureUserRow(sql, authedUser)

    const parsed = await parseJsonBody(req, PresignBody, requestId)
    if (!parsed.ok) return parsed.response
    const { mimeType } = parsed.data

    if (!isAllowedMomentoMime(mimeType)) {
      return ApiErrors.unsupportedMediaType(
        requestId,
        `mimeType "${mimeType}" no soportado. ${UNSUPPORTED_MOMENTO_MIME}`,
      )
    }

    // Degradación clara cuando R2 no está configurado, en vez de un 500 opaco al
    // intentar firmar: el cliente muestra este mensaje y puede caer al camino
    // multipart si el archivo es chico.
    if (!isR2Configured()) {
      return ApiErrors.unprocessable(
        requestId,
        'Almacenamiento de archivos grandes no configurado (R2)',
      )
    }

    const storageKey = `${userId}/${R2_KEY_MARKER}${randomKey()}.${momentoExtensionFor(mimeType)}`
    const uploadUrl = await presignPut(storageKey)

    return Response.json({ uploadUrl, storageKey }, { status: 200 })
  },
)

export const config: Config = {
  path: '/api/momentos-uploads-presign',
}
