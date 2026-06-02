import type { Config } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { attachmentOwnerExists } from './_lib/notas-attachment-owners.js'

const MAX_BYTES = 20 * 1024 * 1024
const STORE = 'notas-attachments'
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/zip',
  'application/json',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

type AttachmentRow = {
  id: string
  owner_type: 'note' | 'prompt'
  owner_id: string
  file_name: string
  mime_type: string
  byte_size: number
  storage_key: string
  created_at: string
  updated_at: string
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

export default withObservability(
  'notas-attachments-upload',
  async (req: Request, _ctx, { requestId }) => {
    if (req.method !== 'POST') return ApiErrors.methodNotAllowed(requestId)

    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    await ensureUserRow(sql, authedUser)
    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return ApiErrors.validation(requestId, 'Esperaba multipart/form-data')
    }

    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return ApiErrors.validation(requestId, 'form-data inválido')
    }

    const file = formData.get('file')
    const ownerType = String(formData.get('ownerType') ?? '')
    const ownerId = String(formData.get('ownerId') ?? '')
    const encrypted = String(formData.get('encrypted') ?? '') === '1'
    const originalFileName = cleanFileName(String(formData.get('originalFileName') ?? ''))
    const originalMimeType = String(formData.get('originalMimeType') ?? '')
    const originalByteSize = Number(String(formData.get('originalByteSize') ?? ''))
    if (!(file instanceof File)) return ApiErrors.validation(requestId, 'Falta file')
    if (ownerType !== 'note' && ownerType !== 'prompt') {
      return ApiErrors.validation(requestId, 'ownerType debe ser note o prompt')
    }
    if (!ownerId) return ApiErrors.validation(requestId, 'ownerId requerido')
    const displayName = encrypted ? originalFileName : cleanFileName(file.name)
    const displayMime = encrypted ? originalMimeType : file.type
    const displaySize = encrypted ? originalByteSize : file.size
    if (!displayName) return ApiErrors.validation(requestId, 'Nombre de archivo requerido')
    if (!Number.isFinite(displaySize) || displaySize < 0) {
      return ApiErrors.validation(requestId, 'Tamaño de archivo inválido')
    }
    if (encrypted && file.type !== 'application/octet-stream') {
      return ApiErrors.unsupportedMediaType(
        requestId,
        'Los anexos cifrados deben subirse como application/octet-stream',
      )
    }
    if (file.size > MAX_BYTES) return ApiErrors.payloadTooLarge(requestId, 'Archivo > 20 MB')
    if (!ALLOWED_MIMES.has(displayMime)) {
      return ApiErrors.unsupportedMediaType(
        requestId,
        `mimeType "${displayMime}" no soportado para anexos`,
      )
    }
    if (!(await attachmentOwnerExists(sql, ownerType, ownerId, userId))) {
      return ApiErrors.notFound(requestId, 'Destino no encontrado')
    }

    const storageKey = `${userId}/${randomKey()}${extensionFor(file.name)}`
    const buf = await file.arrayBuffer()
    const store = getStore(STORE)
    await store.set(storageKey, buf, {
      metadata: { mime: file.type, size: String(buf.byteLength), name: displayName },
    })

    const rows = await sqlTyped<AttachmentRow>(sql`
      INSERT INTO notas_attachments (
        owner_type, owner_id, file_name, mime_type, byte_size, storage_key, user_id
      )
      VALUES (
        ${ownerType}, ${ownerId}, ${displayName}, ${displayMime}, ${displaySize},
        ${storageKey}, ${userId}
      )
      RETURNING id, owner_type, owner_id, file_name, mime_type, byte_size, storage_key, created_at, updated_at
    `)

    return Response.json(rows[0], { status: 201 })
  },
)

export const config: Config = {
  path: '/api/notas-attachments-upload',
}
