import type { Config } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { createNetlifyBlobStorageAdapter } from './_lib/storage-adapter.js'
import { checksumSha256, recordStorageAsset } from './_lib/storage-assets.js'
import { attachmentOwnerExists } from './_lib/notas-attachment-owners.js'
import {
  parseFormFields,
  QueryParam,
  readFormData,
  requireMethod,
} from './_lib/request-contracts.js'
import { z } from 'zod'

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
  owner_type: 'note' | 'prompt' | 'week' | 'task'
  owner_id: string
  file_name: string
  mime_type: string
  byte_size: number
  storage_key: string
  created_at: string
  updated_at: string
}

const AttachmentUploadFields = z.object({
  ownerType: z.enum(['note', 'prompt', 'week', 'task']),
  ownerId: z.preprocess(
    QueryParam.trimmedString({ max: 200 }).normalize,
    z.string().min(1).max(200),
  ),
  encrypted: z.preprocess(
    QueryParam.boolean({ defaultValue: false }).normalize,
    z.boolean(),
  ),
})

function randomKey(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

function extensionFor(name: string): string {
  const ext = name
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
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
    const methodError = requireMethod(req, requestId, ['POST'])
    if (methodError) return methodError

    const authedUser = await getAuthedUser(req)
    const userId = authedUser.id
    const sql = getSql()
    await ensureUserRow(sql, authedUser)

    const parsedFormData = await readFormData(req, requestId)
    if (!parsedFormData.ok) return parsedFormData.response
    const formData = parsedFormData.data
    const parsedFields = parseFormFields(formData, AttachmentUploadFields, requestId)
    if (!parsedFields.ok) return parsedFields.response

    const file = formData.get('file')
    const { ownerType, ownerId, encrypted } = parsedFields.data
    if (!(file instanceof File)) return ApiErrors.validation(requestId, 'Falta file')
    if (encrypted) {
      return ApiErrors.validation(requestId, 'Los anexos no usan cifrado de vault')
    }
    const displayName = cleanFileName(file.name)
    const displayMime = file.type
    const displaySize = file.size
    if (!displayName)
      return ApiErrors.validation(requestId, 'Nombre de archivo requerido')
    if (!Number.isFinite(displaySize) || displaySize < 0) {
      return ApiErrors.validation(requestId, 'Tamaño de archivo inválido')
    }
    if (file.size > MAX_BYTES)
      return ApiErrors.payloadTooLarge(requestId, 'Archivo > 20 MB')
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
    const storage = createNetlifyBlobStorageAdapter(STORE)
    await storage.put(storageKey, buf, {
      mime: file.type,
      size: String(buf.byteLength),
      name: displayName,
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
    await recordStorageAsset(sql, {
      userId,
      domain: 'notas-attachments',
      ownerType,
      ownerId,
      provider: 'netlify-blobs',
      storageKey,
      mimeType: displayMime,
      byteSize: displaySize,
      checksum: checksumSha256(buf),
    })

    return Response.json(rows[0], { status: 201 })
  },
)

export const config: Config = {
  path: '/api/notas-attachments-upload',
}
