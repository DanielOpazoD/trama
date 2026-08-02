import type { Config } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { getSql } from './_lib/db.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { createNetlifyBlobStorageAdapter } from './_lib/storage-adapter.js'
import { checksumSha256, recordStorageAsset } from './_lib/storage-assets.js'
import {
  isAllowedMomentoMime,
  momentoExtensionFor,
  UNSUPPORTED_MOMENTO_MIME,
} from './_lib/momentos-media-mime.js'

/**
 * POST /api/momentos/upload
 *
 * Recibe una imagen o un video (multipart/form-data field "file") y lo sube
 * al store de Netlify Blobs llamado "momentos-media". Devuelve la storageKey
 * que el cliente luego mete en el payload del momento al crearlo.
 *
 * No hace strip de EXIF — agregarlo requiere sharp o similar, lo cual es
 * un bundling adicional pesado. Como mitigación: el endpoint que sirve la
 * blob NO devuelve los headers EXIF, así que el browser nunca los muestra.
 * Los metadatos viven en el blob pero no se exponen.
 *
 * Tamaño máximo: 10 MB — el body de una Netlify Function no da para más. Este
 * es el camino de los archivos CHICOS.
 *
 * Los grandes (>4 MB) ya no pasan por acá: van directo a R2 con URL firmada
 * (`momentos-uploads-presign` → PUT → `momentos-uploads-complete`), que es lo
 * que hace posible subir un video de teléfono. El cliente enruta solo en
 * `api.momentoUpload`; este endpoint sigue existiendo porque para una foto
 * comprimida el viaje de ida y vuelta del presign no compensa.
 */

const MAX_BYTES = 10 * 1024 * 1024

// ω-video: la lista blanca y las extensiones viven en `_lib/momentos-media-mime`
// porque las comparte con el camino de subida directa a R2. Ver allí el porqué.

function randomKey(): string {
  // 16 bytes hex — espacio de colisión suficiente para fotos personales.
  // Crypto.getRandomValues es estándar en el runtime de Netlify Edge/Functions.
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

export default withObservability(
  'momentos-upload',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }

    // Multi-user prep: namespace cada blob bajo `${userId}/...`. Hoy con
    // legacy fallback el userId será 'legacy-single-user'; cuando Clerk
    // se active, los blobs de cada usuario quedan automáticamente
    // separados sin migración. Sin esto, conocer una storageKey daría
    // acceso a la foto sin importar quién la subió.
    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id

    // Esperamos multipart/form-data con field "file".
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return ApiErrors.validation(requestId, 'Esperaba multipart/form-data')
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'form-data inválido'
      return ApiErrors.validation(requestId, msg)
    }

    const file = formData.get('file')
    if (!(file instanceof File)) {
      return ApiErrors.validation(requestId, 'Falta el field "file"')
    }

    if (!isAllowedMomentoMime(file.type)) {
      return ApiErrors.unsupportedMediaType(
        requestId,
        `mimeType "${file.type}" no soportado. ${UNSUPPORTED_MOMENTO_MIME}`,
      )
    }
    if (file.size > MAX_BYTES) {
      return ApiErrors.payloadTooLarge(requestId, 'Archivo > 10 MB')
    }

    // El type ya pasó el filtro de la lista blanca: siempre está en el mapa.
    const ext = momentoExtensionFor(file.type)
    // Key con namespace por usuario: `${userId}/${random}.${ext}`. La
    // storageKey completa se persiste tal cual en el payload del momento;
    // momentos-file.mts re-deriva el userId del path al servir el blob.
    const key = `${userId}/${randomKey()}.${ext}`

    // Netlify Blobs: store "momentos-media". Creado on-demand.
    const buf = await file.arrayBuffer()
    const sql = getSql()
    await ensureUserRow(sql, authedUser)
    await createNetlifyBlobStorageAdapter('momentos-media').put(key, buf, {
      mime: file.type,
      size: String(buf.byteLength),
    })
    await recordStorageAsset(sql, {
      userId,
      domain: 'momentos-media',
      ownerType: 'momentos-upload',
      ownerId: key,
      provider: 'netlify-blobs',
      storageKey: key,
      mimeType: file.type,
      byteSize: buf.byteLength,
      checksum: checksumSha256(buf),
    })

    return Response.json({
      storageKey: key,
      mime: file.type,
      size: buf.byteLength,
    })
  },
)

// υ-bugfix: el path antes era `/api/momentos/upload` y Netlify lo
// matcheaba contra `/api/momentos/:id` de momentos.mts (tratando
// "upload" como un id). Resultado: POST devolvía 405 porque ese handler
// no acepta POST en :id. Mover a un path sin colisión.
export const config: Config = {
  path: '/api/momentos-upload',
}
