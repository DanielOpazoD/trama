import type { Config, Context } from '@netlify/functions'
import { getStore } from '@netlify/blobs'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'

const STORE = 'pdf-studio-saved-pdfs'
const MAX_BYTES = 50 * 1024 * 1024
const ALLOWED_KINDS = new Set(['creation', 'template', 'filled-template'])

type SavedPdfRow = {
  id: string
  saved_doc_id: string
  name: string
  kind: 'creation' | 'template' | 'filled-template'
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

function cleanName(value: string): string {
  return Array.from(value)
    .filter((char) => char !== '/' && char !== '\\' && char.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, 180)
}

function toClient(row: SavedPdfRow) {
  return {
    id: row.id,
    savedDocId: row.saved_doc_id,
    name: row.name,
    kind: row.kind,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    storageKey: row.storage_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function handleGet(req: Request) {
  const authedUser = await getAuthedUser(req)
  const sql = getSql()
  await ensureUserRow(sql, authedUser)
  const rows = await sqlTyped<SavedPdfRow>(sql`
    SELECT id, saved_doc_id, name, kind, mime_type, byte_size, storage_key, created_at, updated_at
    FROM pdf_studio_saved_pdfs
    WHERE user_id = ${authedUser.id}
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
  `)
  return Response.json(rows.map(toClient))
}

async function handlePost(req: Request, requestId: string) {
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
  const savedDocId = String(formData.get('savedDocId') ?? '').trim()
  const name = cleanName(String(formData.get('name') ?? ''))
  const kind = String(formData.get('kind') ?? 'creation')
  if (!(file instanceof File)) return ApiErrors.validation(requestId, 'Falta file')
  if (!savedDocId) return ApiErrors.validation(requestId, 'savedDocId requerido')
  if (!name) return ApiErrors.validation(requestId, 'Nombre requerido')
  if (!ALLOWED_KINDS.has(kind)) return ApiErrors.validation(requestId, 'kind inválido')
  if (file.type !== 'application/pdf') {
    return ApiErrors.unsupportedMediaType(requestId, 'Sólo se aceptan PDFs')
  }
  if (file.size > MAX_BYTES) return ApiErrors.payloadTooLarge(requestId, 'PDF > 50 MB')

  const buf = await file.arrayBuffer()
  const storageKey = `${userId}/${randomKey()}.pdf`
  await getStore(STORE).set(storageKey, buf, {
    metadata: { mime: 'application/pdf', size: String(buf.byteLength), name },
  })

  const rows = await sqlTyped<SavedPdfRow>(sql`
    INSERT INTO pdf_studio_saved_pdfs (
      user_id, saved_doc_id, name, kind, mime_type, byte_size, storage_key
    )
    VALUES (
      ${userId}, ${savedDocId}, ${name}, ${kind}, 'application/pdf',
      ${buf.byteLength}, ${storageKey}
    )
    ON CONFLICT (user_id, saved_doc_id) WHERE deleted_at IS NULL
    DO UPDATE SET
      name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      mime_type = EXCLUDED.mime_type,
      byte_size = EXCLUDED.byte_size,
      storage_key = EXCLUDED.storage_key,
      updated_at = NOW()
    RETURNING id, saved_doc_id, name, kind, mime_type, byte_size, storage_key, created_at, updated_at
  `)

  return Response.json(toClient(rows[0]!), { status: 201 })
}

async function handleDelete(req: Request, context: Context, requestId: string) {
  const id = context.params.id
  if (!id) return ApiErrors.validation(requestId, 'id requerido')
  const authedUser = await getAuthedUser(req)
  const sql = getSql()
  await ensureUserRow(sql, authedUser)
  const rows = await sqlTyped<{ id: string }>(sql`
    UPDATE pdf_studio_saved_pdfs
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${id}
      AND user_id = ${authedUser.id}
      AND deleted_at IS NULL
    RETURNING id
  `)
  if (!rows[0]) return ApiErrors.notFound(requestId, 'No encontrado')
  return new Response(null, { status: 204 })
}

export default withObservability(
  'pdf-studio-saved-pdfs',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method === 'GET') return handleGet(req)
    if (req.method === 'POST') return handlePost(req, requestId)
    if (req.method === 'DELETE') return handleDelete(req, context, requestId)
    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/pdf-studio-saved-pdfs', '/api/pdf-studio-saved-pdfs/:id'],
}
