import type { Config } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'

/**
 * POST /api/momentos-audio-upload
 *
 * Hermano de `momentos-upload.mts` pero para una nota de voz: recibe un
 * archivo de audio (multipart/form-data field "file") y lo sube al MISMO
 * store de Netlify Blobs ("momentos-media"). Devuelve la storageKey que
 * el cliente mete en `payload.audioKey` del momento foto.
 *
 * Se sirve por el endpoint genérico `/api/momentos-file/:userId/:key`
 * (o `/:key` para legacy) —ese handler devuelve el Content-Type desde
 * la metadata del blob, así que reproduce audio sin necesitar un endpoint aparte.
 *
 * Namespacing por usuario (`${userId}/...`) idéntico al de las fotos: la
 * autorización al servir re-deriva el userId del path de la key.
 *
 * Tamaño máximo: 10 MB (límite del body de Netlify Functions). Una nota de
 * voz típica pesa muy por debajo de eso.
 */

const MAX_BYTES = 10 * 1024 * 1024

/** MIME → extensión. Solo formatos que los navegadores saben reproducir
 *  con un `<audio>` sin códecs extra. El Map define a la vez el allowlist
 *  y la extensión del blob. */
const EXT_BY_MIME = new Map<string, string>([
  ['audio/mpeg', 'mp3'],
  ['audio/mp4', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/aac', 'aac'],
  ['audio/ogg', 'ogg'],
  ['audio/webm', 'webm'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
])

function randomKey(): string {
  // 16 bytes hex — mismo espacio de colisión que las fotos.
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

export default withObservability(
  'momentos-audio-upload',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') {
      return ApiErrors.methodNotAllowed(requestId)
    }

    const { id: userId } = await getAuthedUser(req)

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

    const ext = EXT_BY_MIME.get(file.type)
    if (!ext) {
      return ApiErrors.unsupportedMediaType(
        requestId,
        `mimeType "${file.type}" no soportado. Usa mp3, m4a, aac, ogg, webm o wav.`,
      )
    }
    if (file.size > MAX_BYTES) {
      return ApiErrors.payloadTooLarge(requestId, 'Archivo > 10 MB')
    }

    // Key con namespace por usuario: `${userId}/${random}.${ext}`. El mismo
    // store que las fotos; momentos-file.mts re-deriva el userId al servir.
    const key = `${userId}/${randomKey()}.${ext}`

    const store = getStore('momentos-media')
    const buf = await file.arrayBuffer()
    await store.set(key, buf, {
      metadata: { mime: file.type, size: String(buf.byteLength) },
    })

    return Response.json({
      storageKey: key,
      mime: file.type,
      size: buf.byteLength,
    })
  },
)

export const config: Config = {
  path: '/api/momentos-audio-upload',
}
