import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { withObservability } from './_lib/handler-wrap.js'

/**
 * GET /api/momentos/file/:key
 *
 * Sirve un blob de "momentos-media" como respuesta de imagen. Solo expone
 * mime type + bytes — los metadatos extra (EXIF, etc.) viven en el blob
 * pero no se devuelven al cliente. Cache-Control public con max-age largo:
 * la key es inmutable (random hash), así que sirve forever.
 *
 * Si la key no existe, 404.
 */
export default withObservability(
  'momentos-file',
  async (req: Request, context: Context) => {
    if (req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 })
    }
    const key = context.params.key
    if (!key) return new Response('key requerida', { status: 400 })

    const store = getStore('momentos-media')
    const blob = await store.getWithMetadata(key, { type: 'arrayBuffer' })
    if (!blob) {
      return new Response('No encontrado', { status: 404 })
    }
    const mime =
      typeof blob.metadata.mime === 'string' ? blob.metadata.mime : 'image/jpeg'
    return new Response(blob.data, {
      headers: {
        'Content-Type': mime,
        // Inmutable: la key es random hash, nunca se sobreescribe.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  },
)

export const config: Config = {
  path: '/api/momentos/file/:key',
}
