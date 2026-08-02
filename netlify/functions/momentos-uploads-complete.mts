import type { Config } from '@netlify/functions'
import { z } from 'zod'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { getSql } from './_lib/db.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { storageKeyBelongsToUser } from './_lib/legacy-identity.js'
import { recordStorageAsset } from './_lib/storage-assets.js'
import { isR2Configured, r2ObjectExists } from './_lib/r2.js'
import {
  isAllowedMomentoMime,
  isR2MomentoKey,
  UNSUPPORTED_MOMENTO_MIME,
} from './_lib/momentos-media-mime.js'

/**
 * POST /api/momentos-uploads-complete
 *
 * Paso 3 de la subida DIRECTA a R2 para media de Momentos. Tras presignar y
 * PUTear el archivo derecho al bucket, el cliente llama acá.
 *
 * A diferencia de la Biblioteca, acá NO se crea ninguna fila de dominio: la
 * storageKey la guarda el propio momento en su payload, y el momento se crea
 * después. Este endpoint hace las dos cosas que el cliente no puede hacer por
 * sí mismo:
 *
 *   - **Verificar que el objeto llegó** (HEAD firmado). Sin esto, un PUT que
 *     falló a medias dejaría un momento apuntando a un blob inexistente: foto
 *     rota, sin error en ningún lado.
 *   - **Registrar el asset** en `storage_assets` con `provider='r2'`, que es de
 *     donde salen la contabilidad y el barrido de huérfanos.
 *
 * Seguridad:
 *   - `storageKeyBelongsToUser`: la key DEBE estar namespaceada por el userId
 *     autenticado. Conocer una key ajena no permite registrarla a tu nombre.
 *   - `isR2MomentoKey`: la key debe llevar el marcador que puso presign. Sin
 *     esto se podría "completar" una key del camino multipart y desincronizar
 *     el registro respecto de dónde vive el blob de verdad.
 *   - El `byteSize` sale del objeto REAL en R2, no de lo que diga el cliente.
 */

const CompleteBody = z.object({
  storageKey: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(1).max(160),
})

export default withObservability(
  'momentos-uploads-complete',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') return ApiErrors.methodNotAllowed(requestId)

    const authedUser = await getAuthedUser(req, {
      requestId,
      operation: 'momentos-upload.complete',
    })
    const userId = authedUser.id
    const sql = getSql()
    await ensureUserRow(sql, authedUser)

    const parsed = await parseJsonBody(req, CompleteBody, requestId)
    if (!parsed.ok) return parsed.response
    const { storageKey, mimeType } = parsed.data

    if (!isAllowedMomentoMime(mimeType)) {
      return ApiErrors.unsupportedMediaType(
        requestId,
        `mimeType "${mimeType}" no soportado. ${UNSUPPORTED_MOMENTO_MIME}`,
      )
    }

    if (!isR2Configured()) {
      return ApiErrors.unprocessable(
        requestId,
        'Almacenamiento de archivos grandes no configurado (R2)',
      )
    }

    // Una key ajena o sin el marcador → notFound: no revelamos si existe.
    if (!storageKeyBelongsToUser(storageKey, userId) || !isR2MomentoKey(storageKey)) {
      return ApiErrors.notFound(requestId, 'No encontrado')
    }

    const head = await r2ObjectExists(storageKey)
    if (!head.exists) {
      return ApiErrors.notFound(
        requestId,
        'El archivo no llegó a subirse. Reintenta la subida.',
      )
    }

    await recordStorageAsset(sql, {
      userId,
      domain: 'momentos-media',
      ownerType: 'momentos-upload',
      // owner_id = storageKey: estos uploads no tienen una fila "dueña" externa
      // a la que apuntar (igual que el camino multipart).
      ownerId: storageKey,
      provider: 'r2',
      storageKey,
      mimeType,
      byteSize: head.size ?? 0,
      // Sin checksum: el archivo nunca pasó por la función, así que no hay bytes
      // que resumir sin volver a bajarlo entero desde R2.
      checksum: null,
    })

    return Response.json({ storageKey, mime: mimeType, size: head.size ?? 0 })
  },
)

export const config: Config = {
  path: '/api/momentos-uploads-complete',
}
