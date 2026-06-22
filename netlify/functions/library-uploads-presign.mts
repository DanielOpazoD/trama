import type { Config } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { getSql } from './_lib/db.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { z } from 'zod'
import { isR2Configured, presignPut } from './_lib/r2.js'
import { isAllowedLibraryMime } from './_lib/library-upload-mime.js'

/**
 * POST /api/library-uploads-presign
 *
 * Paso 1 de la subida DIRECTA a R2 (archivos grandes, >4 MB). Las Netlify
 * Functions topan el body (~6 MB), así que un archivo grande no puede pasar por
 * /api/library-uploads (multipart). En su lugar:
 *
 *   1. (acá) El cliente pide una URL presignada para PUTear el archivo a R2.
 *   2. El cliente PUTea el archivo DIRECTO al bucket (sin función, sin límite).
 *   3. El cliente llama a /api/library-uploads-complete, que verifica que el
 *      objeto exista y registra el manifest (`storage_assets` provider='r2').
 *
 * La key se genera acá, namespaceada por `${userId}/` (aislamiento multi-user,
 * igual que la subida multipart). El cliente NO elige la key: la recibe firmada.
 *
 * Si R2 no está configurado (faltan env vars), devolvemos un error CLARO en vez
 * de un 500 opaco — el flujo no se puede verificar local sin credenciales.
 */

/** Tope generoso para subidas directas (R2 no tiene el límite de 6 MB de las
 *  funciones). 200 MB cubre videos/archivos pesados sin permitir abusos. */
const MAX_BYTES = 200 * 1024 * 1024

/** Genera una key aleatoria de 32 hex (espejo de `library-uploads.mts`). */
function randomKey(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Extensión saneada del nombre (espejo de `library-uploads.mts`). */
function extensionFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext ? `.${ext.slice(0, 12)}` : ''
}

/**
 * Body del presign. `fileName` para derivar la extensión de la key; `mimeType`
 * validado contra el allowlist de la Biblioteca; `byteSize` topeado a MAX_BYTES
 * (el tamaño REAL se reverifica en complete contra el HEAD de R2).
 */
const PresignBody = z.object({
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(1).max(160),
  byteSize: z.number().int().nonnegative().max(MAX_BYTES),
})

export default withObservability(
  'library-uploads-presign',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') return ApiErrors.methodNotAllowed(requestId)

    const authedUser = await getAuthedUser(req, {
      requestId,
      operation: 'library-upload.presign',
    })
    const userId = authedUser.id
    const sql = getSql()
    await ensureUserRow(sql, authedUser)

    const parsed = await parseJsonBody(req, PresignBody, requestId)
    if (!parsed.ok) return parsed.response
    const { fileName, mimeType, byteSize } = parsed.data

    if (!isAllowedLibraryMime(mimeType)) {
      return ApiErrors.unsupportedMediaType(
        requestId,
        `mimeType "${mimeType}" no soportado`,
      )
    }

    // Degradación clara cuando R2 no está configurado: 503 con mensaje accionable
    // (el cliente lo muestra; sin esto el firmado tiraría un 500 confuso).
    if (!isR2Configured()) {
      return ApiErrors.unprocessable(
        requestId,
        'Almacenamiento de archivos grandes no configurado (R2)',
      )
    }

    // El cliente NO elige la key: la firmamos namespaceada por su userId. El
    // byteSize del body es solo una guía; el tamaño real lo reverifica complete.
    void byteSize
    const storageKey = `${userId}/${randomKey()}${extensionFor(fileName)}`
    const uploadUrl = await presignPut(storageKey)

    return Response.json({ uploadUrl, storageKey }, { status: 200 })
  },
)

export const config: Config = {
  path: '/api/library-uploads-presign',
}
