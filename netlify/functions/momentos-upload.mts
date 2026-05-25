import type { Config } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { withObservability } from './_lib/handler-wrap.js'

/**
 * POST /api/momentos/upload
 *
 * Recibe una imagen (multipart/form-data field "file") y la sube al store
 * de Netlify Blobs llamado "momentos-media". Devuelve la storageKey que
 * el cliente luego mete en el payload del momento al crearlo.
 *
 * No hace strip de EXIF — agregarlo requiere sharp o similar, lo cual es
 * un bundling adicional pesado. Como mitigación: el endpoint que sirve la
 * blob NO devuelve los headers EXIF, así que el browser nunca los muestra.
 * Los metadatos viven en el blob pero no se exponen.
 *
 * Tamaño máximo: 10 MB (sobre eso Netlify Functions rechaza el body
 * de todos modos en el plan estándar).
 */

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

function randomKey(): string {
  // 16 bytes hex — espacio de colisión suficiente para fotos personales.
  // Crypto.getRandomValues es estándar en el runtime de Netlify Edge/Functions.
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

export default withObservability('momentos-upload', async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Esperamos multipart/form-data con field "file".
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return new Response('Esperaba multipart/form-data', { status: 415 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'form-data inválido'
    return new Response(msg, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return new Response('Falta el field "file"', { status: 400 })
  }

  if (!ALLOWED_MIMES.has(file.type)) {
    return new Response(
      `mimeType "${file.type}" no soportado. Usa image/jpeg, image/png, image/webp o image/gif.`,
      { status: 415 },
    )
  }
  if (file.size > MAX_BYTES) {
    return new Response('Archivo > 10 MB', { status: 413 })
  }

  const ext =
    file.type === 'image/jpeg'
      ? 'jpg'
      : file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
          ? 'webp'
          : 'gif'
  const key = `${randomKey()}.${ext}`

  // Netlify Blobs: store "momentos-media". Creado on-demand.
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
})

// υ-bugfix: el path antes era `/api/momentos/upload` y Netlify lo
// matcheaba contra `/api/momentos/:id` de momentos.mts (tratando
// "upload" como un id). Resultado: POST devolvía 405 porque ese handler
// no acepta POST en :id. Mover a un path sin colisión.
export const config: Config = {
  path: '/api/momentos-upload',
}
