import type { Config } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'

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

async function ownerExists(
  ownerType: string,
  ownerId: string,
  userId: string,
): Promise<boolean> {
  const sql = getSql()
  if (ownerType === 'note') {
    const rows = await sqlTyped<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM notes
        WHERE id = ${ownerId} AND user_id = ${userId} AND deleted_at IS NULL
      ) AS exists
    `)
    return rows[0]?.exists === true
  }
  if (ownerType === 'prompt') {
    const rows = await sqlTyped<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM prompts
        WHERE id = ${ownerId} AND user_id = ${userId} AND deleted_at IS NULL
      ) AS exists
    `)
    return rows[0]?.exists === true
  }
  return false
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
    if (!(file instanceof File)) return ApiErrors.validation(requestId, 'Falta file')
    if (ownerType !== 'note' && ownerType !== 'prompt') {
      return ApiErrors.validation(requestId, 'ownerType debe ser note o prompt')
    }
    if (!ownerId) return ApiErrors.validation(requestId, 'ownerId requerido')
    if (file.size > MAX_BYTES) return ApiErrors.payloadTooLarge(requestId, 'Archivo > 20 MB')
    if (!ALLOWED_MIMES.has(file.type)) {
      return ApiErrors.unsupportedMediaType(
        requestId,
        `mimeType "${file.type}" no soportado para anexos`,
      )
    }
    if (!(await ownerExists(ownerType, ownerId, userId))) {
      return ApiErrors.notFound(requestId, 'Destino no encontrado')
    }

    const storageKey = `${userId}/${randomKey()}${extensionFor(file.name)}`
    const buf = await file.arrayBuffer()
    const store = getStore(STORE)
    await store.set(storageKey, buf, {
      metadata: { mime: file.type, size: String(buf.byteLength), name: file.name },
    })

    const rows = await sqlTyped<AttachmentRow>(sql`
      INSERT INTO notas_attachments (
        owner_type, owner_id, file_name, mime_type, byte_size, storage_key, user_id
      )
      VALUES (
        ${ownerType}, ${ownerId}, ${file.name}, ${file.type}, ${buf.byteLength},
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
