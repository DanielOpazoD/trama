import type { Config } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { extensionPreflight, withExtensionCors } from './_lib/extension-cors.js'
import { RECORTE_MEDIA_MIMES, storeRecorteMedia } from './_lib/recortes-media.js'

/**
 * POST /api/recortes-image-upload
 *
 * Sube una imagen o video capturado por la app/extensión al store privado
 * de Netlify Blobs "recortes-media" y
 * devuelve la `imageKey` que el cliente mete en el payload del recorte.
 *
 * Es gemelo de momentos-upload.mts: mismo contrato (multipart field "file",
 * MAX 10 MB, namespace `${userId}/...`), distinto store para que las cuotas y
 * los blobs de cada módulo queden aislados. No recomprime ni hace strip de
 * EXIF server-side (requiere sharp); la extensión ya manda WebP comprimido vía
 * OffscreenCanvas, y el endpoint que sirve la blob no devuelve headers EXIF.
 *
 * Distinto de image_url (la URL http externa del menú "Guardar imagen"):
 * acá los bytes viven en nuestro blob privado, servidos con auth.
 */

const MAX_BYTES = 10 * 1024 * 1024

export default withObservability(
  'recortes-image-upload',
  async (req: Request, _ctx, { requestId }) => {
    const preflight = extensionPreflight(req)
    if (preflight) return preflight
    const cors = (res: Response) => withExtensionCors(req, res)

    if (req.method !== 'POST') {
      return cors(ApiErrors.methodNotAllowed(requestId))
    }

    // Namespace por usuario: conocer la imageKey no basta para leer el blob;
    // el endpoint de servido re-deriva el userId del prefijo del path.
    const { id: userId } = await getAuthedUser(req)

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return cors(ApiErrors.validation(requestId, 'Esperaba multipart/form-data'))
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'form-data inválido'
      return cors(ApiErrors.validation(requestId, msg))
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return cors(ApiErrors.validation(requestId, 'Falta el field "file"'))
    }

    if (!(file.type in RECORTE_MEDIA_MIMES)) {
      return cors(
        ApiErrors.unsupportedMediaType(
          requestId,
          `mimeType "${file.type}" no soportado. Usa image/jpeg, image/png, image/webp, image/gif, video/mp4, video/webm o video/quicktime.`,
        ),
      )
    }
    if (file.size > MAX_BYTES) {
      return cors(ApiErrors.payloadTooLarge(requestId, 'Archivo > 10 MB'))
    }

    // Mismo store + esquema de key que la caché de miniaturas (storeRecorteImage):
    // un solo camino de escritura de blobs de recorte, sin copias que deriven.
    const buf = await file.arrayBuffer()
    const key = await storeRecorteMedia(userId, buf, file.type)

    return cors(
      Response.json({
        imageKey: key,
        mime: file.type,
        size: buf.byteLength,
      }),
    )
  },
)

export const config: Config = {
  path: '/api/recortes-image-upload',
}
