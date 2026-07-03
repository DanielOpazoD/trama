import type { Context } from '@netlify/functions'
import { getSql, sqlTyped } from './db.js'
import { withObservability } from './handler-wrap.js'
import { ApiErrors } from './api-error.js'
import { getAuthedUser } from './auth.js'
import { ensureUserRow } from './user-provisioning.js'
import { createNetlifyBlobStorageAdapter } from './storage-adapter.js'
import {
  checksumSha256,
  recordStorageAsset,
  softDeleteStorageAsset,
} from './storage-assets.js'

// Estructura editable de plantillas (paquete JSON con páginas, casilleros y
// fuentes en base64) + su historial de versiones. El PDF plano ya renderizado
// vive aparte, en pdf-studio-saved-pdfs. Sólo se aceptan plantillas limpias:
// las copias con datos no tienen endpoint y se quedan en el dispositivo.
const STORE = 'pdf-studio-templates'
const MAX_BYTES = 50 * 1024 * 1024
const ALLOWED_STATUS = new Set(['draft', 'ready'])
const SAVED_DOC_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/
const MAX_TAGS = 12
// Versiones retenidas por plantilla: cada push conserva el paquete anterior.
const MAX_VERSIONS = 10

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

type VersionRow = {
  id: string
  name: string
  byte_size: number
  saved_at: string
  created_at: string
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

function parseTags(raw: string): string[] | null {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.some((tag) => typeof tag !== 'string')) {
      return null
    }
    return (parsed as string[])
      .map((tag) => tag.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, MAX_TAGS)
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

function versionToClient(row: VersionRow) {
  return {
    id: row.id,
    name: row.name,
    byteSize: row.byte_size,
    savedAt: row.saved_at,
    createdAt: row.created_at,
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

async function serveStoredPackage(
  storageKey: string,
  requestId: string,
): Promise<Response> {
  const stored = await createNetlifyBlobStorageAdapter(STORE).getWithMetadata<string>(
    storageKey,
    'text',
  )
  if (!stored) return ApiErrors.notFound(requestId, 'Paquete no disponible')
  return new Response(stored.data, {
    headers: { 'content-type': 'application/json' },
  })
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
  return serveStoredPackage(rows[0].storage_key, requestId)
}

async function handleListVersions(req: Request, context: Context, requestId: string) {
  const id = context.params.id
  if (!id) return ApiErrors.validation(requestId, 'id requerido')
  const authedUser = await getAuthedUser(req)
  const sql = getSql()
  await ensureUserRow(sql, authedUser)
  const rows = await sqlTyped<VersionRow>(sql`
    SELECT v.id, v.name, v.byte_size, v.saved_at, v.created_at
    FROM pdf_studio_template_versions v
    JOIN pdf_studio_templates t ON t.id = v.template_id
    WHERE v.template_id = ${id}
      AND v.user_id = ${authedUser.id}
      AND v.deleted_at IS NULL
      AND t.user_id = ${authedUser.id}
      AND t.deleted_at IS NULL
    ORDER BY v.saved_at DESC
  `)
  return Response.json(rows.map(versionToClient))
}

async function handleDownloadVersion(req: Request, context: Context, requestId: string) {
  const id = context.params.id
  const versionId = context.params.versionId
  if (!id || !versionId) return ApiErrors.validation(requestId, 'id requerido')
  const authedUser = await getAuthedUser(req)
  const sql = getSql()
  await ensureUserRow(sql, authedUser)
  const rows = await sqlTyped<{ storage_key: string }>(sql`
    SELECT storage_key
    FROM pdf_studio_template_versions
    WHERE id = ${versionId}
      AND template_id = ${id}
      AND user_id = ${authedUser.id}
      AND deleted_at IS NULL
  `)
  if (!rows[0]) return ApiErrors.notFound(requestId, 'No encontrado')
  return serveStoredPackage(rows[0].storage_key, requestId)
}

/** Poda versiones fuera de la retención: baja las filas, el blob y el
 *  manifiesto. Housekeeping idempotente tras el upsert. */
async function pruneVersions(
  sql: ReturnType<typeof getSql>,
  userId: string,
  templateId: string,
) {
  const stale = await sqlTyped<{ id: string; storage_key: string }>(sql`
    UPDATE pdf_studio_template_versions
    SET deleted_at = NOW()
    WHERE id IN (
      SELECT id FROM pdf_studio_template_versions
      WHERE user_id = ${userId}
        AND template_id = ${templateId}
        AND deleted_at IS NULL
      ORDER BY saved_at DESC
      OFFSET ${MAX_VERSIONS}
    )
      AND user_id = ${userId}
    RETURNING id, storage_key
  `)
  for (const row of stale) {
    await createNetlifyBlobStorageAdapter(STORE)
      .delete(row.storage_key)
      .catch(() => {})
    await softDeleteStorageAsset(sql, {
      userId,
      domain: 'pdf-studio-templates',
      provider: 'netlify-blobs',
      storageKey: row.storage_key,
    })
  }
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
  if (!ALLOWED_STATUS.has(status)) {
    return ApiErrors.validation(requestId, 'status inválido')
  }
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
  // Key nueva por guardado: el blob anterior no se sobreescribe — queda como
  // versión (la retención la aplica pruneVersions). savedDocId ya viene
  // validado a charset seguro.
  const storageKey = `${userId}/${savedDocId}/${randomKey()}.json`
  await createNetlifyBlobStorageAdapter(STORE).put(storageKey, buf, {
    mime: 'application/json',
    size: String(buf.byteLength),
    name,
  })

  // Snapshot + upsert ATÓMICOS: si hay cabeza previa, su paquete pasa al
  // historial en el mismo statement que la reemplaza (sin ventana en la que
  // el paquete viejo quede huérfano de fila).
  const rows = await sqlTyped<TemplateRow>(sql`
    WITH head AS (
      SELECT id, user_id, saved_doc_id, name, byte_size, storage_key, saved_at
      FROM pdf_studio_templates
      WHERE user_id = ${userId}
        AND saved_doc_id = ${savedDocId}
        AND deleted_at IS NULL
    ),
    versioned AS (
      INSERT INTO pdf_studio_template_versions (
        user_id, template_id, saved_doc_id, name, byte_size, storage_key, saved_at
      )
      SELECT user_id, id, saved_doc_id, name, byte_size, storage_key, saved_at
      FROM head
      RETURNING id
    )
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
  await pruneVersions(sql, userId, rows[0]!.id)

  return Response.json(toClient(rows[0]!), { status: 201 })
}

async function handleDelete(req: Request, context: Context, requestId: string) {
  const id = context.params.id
  if (!id) return ApiErrors.validation(requestId, 'id requerido')
  const authedUser = await getAuthedUser(req)
  const sql = getSql()
  await ensureUserRow(sql, authedUser)
  // Cabeza + historial caen juntos (CTE): borrar la plantilla borra sus
  // versiones en el mismo statement.
  const rows = await sqlTyped<{ id: string; storage_key: string }>(sql`
    WITH gone AS (
      UPDATE pdf_studio_templates
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${id}
        AND user_id = ${authedUser.id}
        AND deleted_at IS NULL
      RETURNING id, storage_key
    ),
    versions_gone AS (
      UPDATE pdf_studio_template_versions
      SET deleted_at = NOW()
      WHERE template_id IN (SELECT id FROM gone)
        AND user_id = ${authedUser.id}
        AND deleted_at IS NULL
      RETURNING id
    )
    SELECT id, storage_key FROM gone
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

async function handlePdfStudioTemplates(
  req: Request,
  context: Context,
  requestId: string,
): Promise<Response> {
  const isVersions = req.url.includes('/versions')
  if (req.method === 'GET') {
    if (context.params.versionId) return handleDownloadVersion(req, context, requestId)
    if (isVersions) return handleListVersions(req, context, requestId)
    return context.params.id ? handleDownload(req, context, requestId) : handleList(req)
  }
  if (req.method === 'POST') return handlePost(req, requestId)
  if (req.method === 'DELETE') return handleDelete(req, context, requestId)
  return ApiErrors.methodNotAllowed(requestId)
}

export default withObservability(
  'pdf-studio-templates',
  async (req: Request, context: Context, { requestId }) =>
    handlePdfStudioTemplates(req, context, requestId),
)
