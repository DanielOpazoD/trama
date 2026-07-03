import type { Config, Context } from '@netlify/functions'
import { getSql, sqlTyped } from './_lib/db.js'
import { withObservability } from './_lib/handler-wrap.js'
import { ApiErrors } from './_lib/api-error.js'
import { getAuthedUser } from './_lib/auth.js'
import { ensureUserRow } from './_lib/user-provisioning.js'
import { createNetlifyBlobStorageAdapter } from './_lib/storage-adapter.js'
import {
  checksumSha256,
  recordStorageAsset,
  softDeleteStorageAsset,
} from './_lib/storage-assets.js'

// Estructura editable de plantillas (paquete JSON con páginas, casilleros y
// fuentes en base64). El PDF plano ya renderizado vive aparte, en
// pdf-studio-saved-pdfs. Sólo se aceptan plantillas limpias: las copias con
// datos no tienen endpoint y se quedan en el dispositivo.
const STORE = 'pdf-studio-templates'
const MAX_BYTES = 50 * 1024 * 1024
const ALLOWED_STATUS = new Set(['draft', 'ready'])
const SAVED_DOC_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/
const MAX_TAGS = 12

type TemplateRow = {
  id: string
  saved_doc_id: string
  name: string
  description: string
  tags: string[]
  status: 'draft' | 'ready'
  page_count: number
  field_count: number
  byte_size: number
  storage_key: string
  saved_at: string
  created_at: string
  updated_at: string
}

function cleanName(value: string): string {
  return Array.from(value)
    .filter((char) => char !== '/' && char !== '\\' && char.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, 180)
}

function parseTags(raw: string): string[] | null {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.some((tag) => typeof tag !== 'string')) {
      return null
    }
    return (parsed as string[]).map((tag) => tag.trim().slice(0, 60)).filter(Boolean).slice(0, MAX_TAGS)
  } catch {
    return null
  }
}

function toClient(row: TemplateRow) {
  return {
    id: row.id,
    savedDocId: row.saved_doc_id,
    name: row.name,
    description: row.description,
    tags: row.tags,
    status: row.status,
    pageCount: row.page_count,
    fieldCount: row.field_count,
    byteSize: row.byte_size,
    savedAt: row.saved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function handleList(req: Request) {
  const authedUser = await getAuthedUser(req)
  const sql = getSql()
  await ensureUserRow(sql, authedUser)
  const rows = await sqlTyped<TemplateRow>(sql`
    SELECT id, saved_doc_id, name, description, tags, status, page_count,
      field_count, byte_size, storage_key, saved_at, created_at, updated_at
    FROM pdf_studio_templates
    WHERE user_id = ${authedUser.id}
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
  `)
  return Response.json(rows.map(toClient))
}

async function handleDownload(req: Request, context: Context, requestId: string) {
  const id = context.params.id
  if (!id) return ApiErrors.validation(requestId, 'id requerido')
  const authedUser = await getAuthedUser(req)
  const sql = getSql()
  await ensureUserRow(sql, authedUser)
  const rows = await sqlTyped<{ storage_key: string }>(sql`
    SELECT storage_key
    FROM pdf_studio_templates
    WHERE id = ${id}
      AND user_id = ${authedUser.id}
      AND deleted_at IS NULL
  `)
  if (!rows[0]) return ApiErrors.notFound(requestId, 'No encontrado')
  const stored = await createNetlifyBlobStorageAdapter(STORE).getWithMetadata<string>(
    rows[0].storage_key,
    'text',
  )
  if (!stored) return ApiErrors.notFound(requestId, 'Paquete no disponible')
  return new Response(stored.data, {
    headers: { 'content-type': 'application/json' },
  })
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

  const file = formData.get('package')
  const savedDocId = String(formData.get('savedDocId') ?? '').trim()
  const name = cleanName(String(formData.get('name') ?? ''))
  const description = String(formData.get('description') ?? '').slice(0, 2000)
  const tags = parseTags(String(formData.get('tags') ?? ''))
  const status = String(formData.get('status') ?? 'ready')
  const savedAtMs = Number(formData.get('savedAt') ?? NaN)
  const pageCount = Number(formData.get('pageCount') ?? 0)
  const fieldCount = Number(formData.get('fieldCount') ?? 0)
  if (!(file instanceof File)) return ApiErrors.validation(requestId, 'Falta package')
  if (!SAVED_DOC_ID_RE.test(savedDocId)) {
    return ApiErrors.validation(requestId, 'savedDocId inválido')
  }
  if (!name) return ApiErrors.validation(requestId, 'Nombre requerido')
  if (tags === null) return ApiErrors.validation(requestId, 'tags inválidos')
  if (!ALLOWED_STATUS.has(status)) return ApiErrors.validation(requestId, 'status inválido')
  if (!Number.isFinite(savedAtMs) || savedAtMs <= 0) {
    return ApiErrors.validation(requestId, 'savedAt requerido')
  }
  if (file.type !== 'application/json') {
    return ApiErrors.unsupportedMediaType(requestId, 'El paquete debe ser JSON')
  }
  if (file.size > MAX_BYTES) {
    return ApiErrors.payloadTooLarge(requestId, 'Plantilla > 50 MB')
  }

  const buf = await file.arrayBuffer()
  // Key determinista por documento: cada re-guardado sobreescribe el mismo
  // blob (las plantillas se sincronizan seguido; keys aleatorias dejarían un
  // huérfano por versión). savedDocId ya viene validado a charset seguro.
  const storageKey = `${userId}/${savedDocId}.json`
  await createNetlifyBlobStorageAdapter(STORE).put(storageKey, buf, {
    mime: 'application/json',
    size: String(buf.byteLength),
    name,
  })

  const rows = await sqlTyped<TemplateRow>(sql`
    INSERT INTO pdf_studio_templates (
      user_id, saved_doc_id, name, description, tags, status,
      page_count, field_count, byte_size, storage_key, saved_at
    )
    VALUES (
      ${userId}, ${savedDocId}, ${name}, ${description}, ${tags}, ${status},
      ${Number.isFinite(pageCount) ? Math.max(0, Math.trunc(pageCount)) : 0},
      ${Number.isFinite(fieldCount) ? Math.max(0, Math.trunc(fieldCount)) : 0},
      ${buf.byteLength}, ${storageKey}, ${new Date(savedAtMs).toISOString()}
    )
    ON CONFLICT (user_id, saved_doc_id) WHERE deleted_at IS NULL
    DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      tags = EXCLUDED.tags,
      status = EXCLUDED.status,
      page_count = EXCLUDED.page_count,
      field_count = EXCLUDED.field_count,
      byte_size = EXCLUDED.byte_size,
      storage_key = EXCLUDED.storage_key,
      saved_at = EXCLUDED.saved_at,
      updated_at = NOW()
    RETURNING id, saved_doc_id, name, description, tags, status, page_count,
      field_count, byte_size, storage_key, saved_at, created_at, updated_at
  `)
  await recordStorageAsset(sql, {
    userId,
    domain: 'pdf-studio-templates',
    ownerType: 'pdf-studio-template',
    ownerId: savedDocId,
    provider: 'netlify-blobs',
    storageKey,
    mimeType: 'application/json',
    byteSize: buf.byteLength,
    checksum: checksumSha256(buf),
  })

  return Response.json(toClient(rows[0]!), { status: 201 })
}

async function handleDelete(req: Request, context: Context, requestId: string) {
  const id = context.params.id
  if (!id) return ApiErrors.validation(requestId, 'id requerido')
  const authedUser = await getAuthedUser(req)
  const sql = getSql()
  await ensureUserRow(sql, authedUser)
  const rows = await sqlTyped<{ id: string; storage_key: string }>(sql`
    UPDATE pdf_studio_templates
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${id}
      AND user_id = ${authedUser.id}
      AND deleted_at IS NULL
    RETURNING id, storage_key
  `)
  if (!rows[0]) return ApiErrors.notFound(requestId, 'No encontrado')
  await softDeleteStorageAsset(sql, {
    userId: authedUser.id,
    domain: 'pdf-studio-templates',
    provider: 'netlify-blobs',
    storageKey: rows[0].storage_key,
  })
  return new Response(null, { status: 204 })
}

export default withObservability(
  'pdf-studio-templates',
  async (req: Request, context: Context, { requestId }) => {
    if (req.method === 'GET') {
      return context.params.id
        ? handleDownload(req, context, requestId)
        : handleList(req)
    }
    if (req.method === 'POST') return handlePost(req, requestId)
    if (req.method === 'DELETE') return handleDelete(req, context, requestId)
    return ApiErrors.methodNotAllowed(requestId)
  },
)

export const config: Config = {
  path: ['/api/pdf-studio-templates', '/api/pdf-studio-templates/:id'],
}
