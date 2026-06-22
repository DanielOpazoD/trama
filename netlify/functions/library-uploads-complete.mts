import type { Config } from '@netlify/functions'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { getSql } from './_lib/db.js'
import { parseJsonBody } from './_lib/zod-body.js'
import { z } from 'zod'
import { recordStorageAsset } from './_lib/storage-assets.js'
import { renameLibraryItem } from './_lib/library-overrides.js'
import { storageKeyBelongsToUser } from './_lib/legacy-identity.js'
import { logOperationalEvent } from './_lib/operational-events.js'
import { isR2Configured, r2ObjectExists } from './_lib/r2.js'
import { fileTypeForMime, isAllowedLibraryMime } from './_lib/library-upload-mime.js'

/**
 * POST /api/library-uploads-complete
 *
 * Paso 3 de la subida DIRECTA a R2 (archivos grandes). Tras presignar
 * (/api/library-uploads-presign) y PUTear el archivo derecho al bucket, el
 * cliente llama acá para registrar el manifest. Espeja el camino de escritura de
 * /api/library-uploads (multipart) pero con provider='r2' y SIN tocar el blob:
 * el archivo ya está en R2.
 *
 * Seguridad:
 *   - `storageKeyBelongsToUser`: la key DEBE estar namespaceada por el userId del
 *     authed user. Conocer una key ajena no permite registrarla a tu nombre.
 *   - `r2ObjectExists`: no registramos un manifest de un archivo que el PUT no
 *     llegó a subir (HEAD firmado contra R2). El tamaño se toma del objeto real.
 *
 * Devuelve el item creado en la MISMA forma camelCase que /api/library-uploads,
 * para que el cliente lo inserte en la lista sin re-mapear.
 */

const MAX_BYTES = 200 * 1024 * 1024

/** Limpia el nombre de archivo (espejo de `library-uploads.mts`). */
function cleanFileName(value: string): string {
  return Array.from(value)
    .filter((char) => char !== '/' && char !== '\\' && char.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, 240)
}

/**
 * Normaliza un `takenAt` del cliente a ISO (espejo de `library-uploads.mts`).
 * Vacío o inválido → null (cae al default NOW() del manifest).
 */
function normalizeTakenAt(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/**
 * Body del complete. `storageKey` es la key firmada que devolvió presign;
 * `byteSize` es solo un hint (el tamaño real se toma del HEAD de R2). `takenAt`
 * opcional ancla `created_at` a la fecha de captura.
 */
const CompleteBody = z.object({
  storageKey: z.string().trim().min(1).max(600),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(1).max(160),
  byteSize: z.number().int().nonnegative().max(MAX_BYTES),
  takenAt: z.string().trim().optional(),
})

export default withObservability(
  'library-uploads-complete',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') return ApiErrors.methodNotAllowed(requestId)

    const authedUser = await getAuthedUser(req, {
      requestId,
      operation: 'library-upload.complete',
    })
    const userId = authedUser.id
    const sql = getSql()
    await ensureUserRow(sql, authedUser)

    const parsed = await parseJsonBody(req, CompleteBody, requestId)
    if (!parsed.ok) return parsed.response
    const { storageKey, fileName, mimeType, takenAt } = parsed.data

    if (!isAllowedLibraryMime(mimeType)) {
      return ApiErrors.unsupportedMediaType(
        requestId,
        `mimeType "${mimeType}" no soportado`,
      )
    }

    if (!isR2Configured()) {
      return ApiErrors.unprocessable(
        requestId,
        'Almacenamiento de archivos grandes no configurado (R2)',
      )
    }

    // Authz: la key debe pertenecer al usuario autenticado (`${userId}/...`).
    // Una key ajena → notFound (no revelamos que existe ni la registramos).
    if (!storageKeyBelongsToUser(storageKey, userId)) {
      logOperationalEvent({
        event: 'blob.access.denied',
        severity: 'warn',
        requestId,
        method: req.method,
        path: new URL(req.url).pathname,
        operation: 'library-upload.complete',
        userId,
        reason: 'storage_key_owner_mismatch',
      })
      return ApiErrors.notFound(requestId, 'No encontrado')
    }

    // El objeto debe existir en R2: no registramos un manifest de un PUT que no
    // se completó. El tamaño real lo tomamos del objeto (Content-Length); si R2
    // no lo reporta, caemos al hint del cliente.
    const head = await r2ObjectExists(storageKey)
    if (!head.exists) {
      return ApiErrors.notFound(requestId, 'El archivo no se encontró en el almacenamiento')
    }
    // El cap se enforcea contra el tamaño REAL del objeto (HEAD), NO contra el
    // `byteSize` del cliente (un hint manipulable): si no, un cliente podría
    // presignar declarando "1 KB", PUTear 500 MB y completar igual. Si R2 no
    // reporta el tamaño, no podemos verificarlo → rechazamos en vez de confiar.
    if (head.size == null) {
      return ApiErrors.unprocessable(
        requestId,
        'No se pudo verificar el tamaño del archivo subido',
      )
    }
    if (head.size > MAX_BYTES) {
      return ApiErrors.payloadTooLarge(
        requestId,
        `El archivo supera el límite de ${MAX_BYTES / (1024 * 1024)} MB`,
      )
    }
    const realByteSize = head.size

    const name = cleanFileName(fileName)
    if (!name) return ApiErrors.validation(requestId, 'Nombre de archivo requerido')
    const normalizedTakenAt = normalizeTakenAt(takenAt)

    // owner_id = storageKey: estable, único y dentro del rango del CHECK; estos
    // uploads no tienen una fila "dueña" externa a la que apuntar (igual que el
    // camino multipart).
    const assetId = await recordStorageAsset(sql, {
      userId,
      domain: 'library-uploads',
      ownerType: 'biblioteca-upload',
      ownerId: storageKey,
      provider: 'r2',
      storageKey,
      mimeType,
      byteSize: realByteSize,
      checksum: null,
      createdAt: normalizedTakenAt,
    })
    if (!assetId) return ApiErrors.internal(requestId, 'No se pudo registrar el archivo')

    // El nombre real vive en el override (`storage_assets` no tiene columna de
    // nombre); el read-model hace COALESCE(display_title, 'Archivo').
    const override = await renameLibraryItem(sql, {
      userId,
      itemKind: 'library-upload',
      itemId: assetId,
      displayTitle: name,
    })

    const createdAt = normalizedTakenAt ?? new Date().toISOString()
    return Response.json(
      {
        item: {
          id: `library-upload:${assetId}`,
          kind: 'library-upload',
          itemId: assetId,
          title: name,
          fileType: fileTypeForMime(mimeType),
          source: 'subido',
          mimeType,
          byteSize: realByteSize,
          storageKey,
          storageDomain: 'library-uploads',
          tags: [],
          pinned: false,
          aiStatus: null,
          createdAt,
          updatedAt: override?.updated_at ?? createdAt,
        },
      },
      { status: 201 },
    )
  },
)

export const config: Config = {
  path: '/api/library-uploads-complete',
}
