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

/** Tope de mimes exactos permitidos (los `image/*`, `video/*`, `text/*` se
 *  validan por prefijo aparte). */
const ALLOWED_EXACT_MIMES = new Set([
  'application/pdf',
  'application/json',
  // Office (docx / xlsx / pptx + legados)
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

/** ¿Es un mime aceptado para la Biblioteca? Imágenes, videos y texto por
 *  prefijo; el resto contra la lista exacta. */
function isAllowedMime(mime: string): boolean {
  if (mime.startsWith('image/')) return true
  if (mime.startsWith('video/')) return true
  if (mime.startsWith('text/')) return true
  return ALLOWED_EXACT_MIMES.has(mime)
}

/** Familia de archivo derivada del mime (espejo del CASE del read-model). */
function fileTypeForMime(mime: string): string {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  if (
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'text/csv'
  ) {
    return 'spreadsheet'
  }
  if (
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return 'presentation'
  }
  if (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/json' ||
    mime.startsWith('text/')
  ) {
    return 'document'
  }
  return 'other'
}

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
      if (!isAllowedMime(file.type)) {
        return ApiErrors.unsupportedMediaType(
          requestId,
          `mimeType "${file.type}" no soportado`,
        )
      }
    }

    const storage = createNetlifyBlobStorageAdapter(STORE)
    const items: UploadedItem[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const name = cleanFileName(file.name)
      const mime = file.type
      const size = file.size
      const takenAt = normalizeTakenAt(takenAtRaw[i])

      const storageKey = `${userId}/${randomKey()}${extensionFor(file.name)}`
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
      if (!assetId) {
        return ApiErrors.internal(requestId, 'No se pudo registrar el archivo')
      }

      // El nombre real vive en el override (`storage_assets` no tiene columna de
      // nombre); el read-model hace COALESCE(display_title, 'Archivo').
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
    }

    return Response.json({ items }, { status: 201 })
  },
)

export const config: Config = {
  path: '/api/library-uploads',
}
