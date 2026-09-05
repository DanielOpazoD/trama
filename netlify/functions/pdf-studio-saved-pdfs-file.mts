import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { logOperationalEvent } from './_lib/operational-events.js'
import { storageKeyBelongsToUser } from './_lib/legacy-identity.js'
import { createNetlifyBlobStorageAdapter } from './_lib/storage-adapter.js'
import { IMMUTABLE_PRIVATE_MEDIA_CACHE } from './_lib/media-cache.js'

/**
 * GET /api/pdf-studio-saved-pdfs-file/:userId/:key — sirve el PDF que Imprenta
 * subió al guardar una creación, plantilla o copia rellenada.
 *
 * Hasta ahora este dominio era de sólo escritura: `pdf-studio-saved-pdfs` subía
 * y borraba, pero nada devolvía el archivo, así que en Biblioteca esos PDFs
 * salían sin descarga ni visor y no se podían traer de vuelta a Imprenta.
 * Espejo exacto de `notas-attachments-file`: el key debe estar namespaced bajo
 * el usuario que pide Y existir la fila viva en `pdf_studio_saved_pdfs`.
 */
const STORE = 'pdf-studio-saved-pdfs'

function readRawStorageKey(context: Context): string | null {
  const rawKey = context.params.key
  if (!rawKey) return null
  const rawUserId = context.params.userId
  return rawUserId ? `${rawUserId}/${rawKey}` : rawKey
}

function safeFileName(name: string): string {
  const base = name.replace(/"/g, '').trim() || 'imprenta'
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`
}

export default withObservability(
  'pdf-studio-saved-pdfs-file',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method !== 'GET') return ApiErrors.methodNotAllowed(requestId)

    const rawKey = readRawStorageKey(context)
    if (!rawKey) return ApiErrors.validation(requestId, 'key requerida')
    const storageKey = decodeURIComponent(rawKey)
    const { id: userId } = await getAuthedUser(req)
    if (!storageKeyBelongsToUser(storageKey, userId)) {
      logOperationalEvent({
        event: 'blob.access.denied',
        severity: 'warn',
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        operation: 'pdf-studio-saved-pdf.blob.read',
        userId,
        reason: 'storage_key_owner_mismatch',
      })
      return ApiErrors.notFound(requestId, 'No encontrado')
    }

    const sql = getSql()
    const refs = await sqlTyped<{ name: string; mime_type: string }>(sql`
      SELECT name, mime_type
      FROM pdf_studio_saved_pdfs
      WHERE storage_key = ${storageKey}
        AND user_id = ${userId}
        AND deleted_at IS NULL
    `)
    if (refs.length === 0) {
      logOperationalEvent({
        event: 'blob.access.denied',
        severity: 'warn',
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        operation: 'pdf-studio-saved-pdf.blob.read',
        userId,
        reason: 'saved_pdf_metadata_missing',
      })
      return ApiErrors.notFound(requestId, 'No encontrado')
    }

    const blob = await createNetlifyBlobStorageAdapter(
      STORE,
    ).getWithMetadata<ArrayBuffer>(storageKey, 'arrayBuffer')
    if (!blob) return ApiErrors.notFound(requestId, 'No encontrado')

    const ref = refs[0]!
    return new Response(blob.data, {
      headers: {
        'Content-Type': ref.mime_type,
        'Content-Disposition': `attachment; filename="${safeFileName(ref.name)}"`,
        // Cada guardado sube a un key aleatorio nuevo: el blob detrás de un key
        // nunca cambia, así que se puede cachear para siempre (privado).
        'Cache-Control': IMMUTABLE_PRIVATE_MEDIA_CACHE,
        Vary: 'Authorization',
      },
    })
  },
)

export const config: Config = {
  path: [
    '/api/pdf-studio-saved-pdfs-file/:key',
    '/api/pdf-studio-saved-pdfs-file/:userId/:key',
  ],
}
