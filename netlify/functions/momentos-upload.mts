import type { Config } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { getSql } from './_lib/db.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { createNetlifyBlobStorageAdapter } from './_lib/storage-adapter.js'
import { checksumSha256, recordStorageAsset } from './_lib/storage-assets.js'

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
 * Tamaño máximo: 10 MB (sobre eso Netlify Functions rechaza el body de
 * todos modos en el plan estándar). Alcanza para fotos y para clips cortos;
 * los videos NO se comprimen client-side (haría falta transcodificar), así
 * que el composer valida este mismo tope antes de subir. Aceptar videos
 * largos exigiría upload directo al store con URL firmada — otro trabajo.
 */

const MAX_BYTES = 10 * 1024 * 1024

// ω-video: extensión por mimeType. Las claves son además la lista blanca
// (ALLOWED_MIMES se deriva de acá) para que ambas no se desincronicen. Los
// videos comparten store y flujo con las fotos; solo cambian mime y ext.
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}
const ALLOWED_MIMES = new Set(Object.keys(EXT_BY_MIME))

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

    if (!ALLOWED_MIMES.has(file.type)) {
      return ApiErrors.unsupportedMediaType(
        requestId,
        `mimeType "${file.type}" no soportado. Usa una imagen (jpeg, png, webp, gif) o un video (mp4, webm, mov).`,
      )
    }
    if (file.size > MAX_BYTES) {
      return ApiErrors.payloadTooLarge(requestId, 'Archivo > 10 MB')
    }

    // El type ya pasó el filtro ALLOWED_MIMES, así que siempre está en el map.
    const ext = EXT_BY_MIME[file.type] ?? 'bin'
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
