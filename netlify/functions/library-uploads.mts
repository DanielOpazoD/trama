import type { Config } from '@netlify/functions'
import { getSql } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { createNetlifyBlobStorageAdapter } from './_lib/storage-adapter.js'
import { checksumSha256, recordStorageAsset } from './_lib/storage-assets.js'
import { renameLibraryItem } from './_lib/library-overrides.js'
import { readFormData, requireMethod } from './_lib/request-contracts.js'
import { logOperationalEvent } from './_lib/operational-events.js'
import { fileTypeForMime, isAllowedLibraryMime } from './_lib/library-upload-mime.js'

/**
 * POST /api/library-uploads
 *
 * Sube uno o varios archivos DIRECTO a la Biblioteca (PR1 de subida). A
 * diferencia de las otras fuentes del read-model (adjuntos, recortes, fotos,
 * PDFs), estos archivos no tienen tabla nativa: `storage_assets` (dominio
 * `library-uploads`) ES su fuente de verdad. El nombre legible se persiste como
 * `library_item_overrides.display_title` (la tabla de manifest no tiene columna
 * de nombre), y la fecha de captura opcional (`takenAt`, de EXIF/lastModified
 * del cliente) se ancla en `created_at` para que la Biblioteca ordene/posicione
 * por la fecha real de la foto, no por la hora de subida.
 *
 * Multipart: múltiples campos `file` (`formData.getAll('file')`) y, en paralelo,
 * campos `takenAt` alineados por índice (string ISO o '' si no hay fecha).
 *
 * Devuelve `{ items: [...] }` con los items creados en la MISMA forma camelCase
 * que `GET /api/biblioteca`, para que el cliente los inserte sin re-mapear.
 */

const STORE = 'library-uploads'
const MAX_BYTES = 50 * 1024 * 1024
const MAX_FILES = 50

function randomKey(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

function extensionFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext ? `.${ext.slice(0, 12)}` : ''
}

function cleanFileName(value: string): string {
  return Array.from(value)
    .filter((char) => char !== '/' && char !== '\\' && char.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, 240)
}

/**
 * Normaliza un `takenAt` del cliente a ISO. Acepta solo fechas válidas; vacío o
 * inválido → null (cae al default NOW() del manifest). No confiamos en el
 * string crudo: lo re-serializamos vía Date para uniformar el formato.
 */
function normalizeTakenAt(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/** Item creado, en la forma camelCase de `GET /api/biblioteca`. */
type UploadedItem = {
  id: string
  kind: 'library-upload'
  itemId: string
  title: string
  fileType: string
  source: 'subido'
  mimeType: string
  byteSize: number
  storageKey: string
  storageDomain: 'library-uploads'
  tags: string[]
  pinned: boolean
  aiStatus: string | null
  createdAt: string
  updatedAt: string
}

export default withObservability(
  'library-uploads',
  async (req: Request, _ctx, { requestId }) => {
    const methodError = requireMethod(req, requestId, ['POST'])
    if (methodError) return methodError

    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    await ensureUserRow(sql, authedUser)

    const parsedFormData = await readFormData(req, requestId)
    if (!parsedFormData.ok) return parsedFormData.response
    const formData = parsedFormData.data

    const files = formData.getAll('file').filter((f): f is File => f instanceof File)
    if (files.length === 0) return ApiErrors.validation(requestId, 'Falta file')
    if (files.length > MAX_FILES) {
      return ApiErrors.validation(requestId, `Máximo ${MAX_FILES} archivos por subida`)
    }
    // `takenAt` viaja en paralelo a `file`, alineado por índice. Puede faltar
    // (menos entradas que files): los índices sin valor caen a null.
    const takenAtRaw = formData.getAll('takenAt')

    // Validamos TODOS los archivos antes de escribir ninguno: si uno es
    // inválido, rechazamos la subida entera (no dejamos a medias).
    for (const file of files) {
      const name = cleanFileName(file.name)
      if (!name) return ApiErrors.validation(requestId, 'Nombre de archivo requerido')
      if (!Number.isFinite(file.size) || file.size < 0) {
        return ApiErrors.validation(requestId, 'Tamaño de archivo inválido')
      }
      if (file.size > MAX_BYTES) {
        return ApiErrors.payloadTooLarge(requestId, `"${name}" supera los 50 MB`)
      }
      if (!isAllowedLibraryMime(file.type)) {
        return ApiErrors.unsupportedMediaType(
          requestId,
          `mimeType "${file.type}" no soportado`,
        )
      }
    }

    const storage = createNetlifyBlobStorageAdapter(STORE)
    const items: UploadedItem[] = []
    const failed: { name: string; message: string }[] = []

    // Subida con ÉXITO PARCIAL: blob + manifest no son transaccionales entre sí
    // (Blobs y Postgres son sistemas distintos), así que no podemos hacer la
    // tanda atómica. En vez de abortar y dejar a medias (un reintegro entero
    // duplicaría lo ya subido, porque la storage_key es aleatoria), registramos
    // el fallo de CADA archivo y seguimos: el cliente sabe qué entró y reintenta
    // solo lo que falló.
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const name = cleanFileName(file.name)
      const mime = file.type
      const size = file.size
      const takenAt = normalizeTakenAt(takenAtRaw[i])
      const storageKey = `${userId}/${randomKey()}${extensionFor(file.name)}`

      try {
        const buf = await file.arrayBuffer()
        await storage.put(storageKey, buf, {
          mime,
          size: String(buf.byteLength),
          name,
        })

        // owner_id = storageKey: estable, único y dentro del rango 1..300 del
        // CHECK; estos uploads no tienen una fila "dueña" externa a la que apuntar.
        const assetId = await recordStorageAsset(sql, {
          userId,
          domain: 'library-uploads',
          ownerType: 'biblioteca-upload',
          ownerId: storageKey,
          provider: 'netlify-blobs',
          storageKey,
          mimeType: mime,
          byteSize: size,
          checksum: checksumSha256(buf),
          createdAt: takenAt,
        })
        if (!assetId) throw new Error('No se pudo registrar el archivo')

        // El nombre real vive en el override (`storage_assets` no tiene columna
        // de nombre); el read-model hace COALESCE(display_title, 'Archivo').
        const override = await renameLibraryItem(sql, {
          userId,
          itemKind: 'library-upload',
          itemId: assetId,
          displayTitle: name,
        })

        const createdAt = takenAt ?? new Date().toISOString()
        items.push({
          id: `library-upload:${assetId}`,
          kind: 'library-upload',
          itemId: assetId,
          title: name,
          fileType: fileTypeForMime(mime),
          source: 'subido',
          mimeType: mime,
          byteSize: size,
          storageKey,
          storageDomain: 'library-uploads',
          tags: [],
          pinned: false,
          aiStatus: null,
          createdAt,
          updatedAt: override?.updated_at ?? createdAt,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo subir'
        // Log server-side para diagnosticar (la causa real del fallo del blob /
        // manifest no debe perderse en el `failed[]` que ve el cliente).
        logOperationalEvent({
          event: 'storage.manifest.failed',
          severity: 'warn',
          requestId,
          operation: 'library-upload',
          userId,
          reason: message,
        })
        failed.push({ name, message })
      }
    }

    // Si no entró ninguno pese a pasar la validación, es un fallo del servidor:
    // devolvemos el motivo REAL del primer fallo (no un genérico) para que el
    // cliente lo muestre y podamos diagnosticar.
    if (items.length === 0 && failed.length > 0) {
      return ApiErrors.internal(requestId, failed[0]!.message)
    }
    return Response.json({ items, failed }, { status: 201 })
  },
)

export const config: Config = {
  path: '/api/library-uploads',
}
