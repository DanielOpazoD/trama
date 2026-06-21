import type { Context } from '@netlify/functions'
import { z } from 'zod'
import { ApiErrors } from './api-error.js'
import { getAuthedUser } from './auth.js'
import { getSql, sqlTyped } from './db.js'
import { withObservability } from './handler-wrap.js'
import {
  checksumSha256,
  recordStorageAsset,
  softDeleteStorageAsset,
} from './storage-assets.js'
import { ensureUserRow } from './user-provisioning.js'
import { parseJsonBody } from './zod-body.js'

const MAX_STAMP_ASSET_BYTES = 750_000
const StampKind = z.enum(['signature', 'stamp'])
const StampMimeType = z.enum(['image/png', 'image/jpeg'])
const DataUrl = z.string().min(1)

const StampAssetCreateBody = z.object({
  id: z.string().min(1).max(120),
  kind: StampKind,
  name: z.string().trim().min(1).max(120),
  src: DataUrl,
  mimeType: StampMimeType,
  width: z.number().int().min(1).max(10_000),
  height: z.number().int().min(1).max(10_000),
})

const StampAssetPatchBody = z.object({
  name: z.string().trim().min(1).max(120),
})

type StampAssetRow = {
  id: string
  user_id: string
  kind: 'signature' | 'stamp'
  name: string
  src: string
  mime_type: 'image/png' | 'image/jpeg'
  width: number
  height: number
  byte_size: number
  created_at: string
  updated_at: string
  last_used_at: string
}

function byteSize(value: string): number {
  return new TextEncoder().encode(value).length
}

function dataUrlMime(src: string): string | null {
  return /^data:([^;,]+)[;,]/i.exec(src)?.[1]?.toLowerCase() ?? null
}

function validateImageDataUrl(
  requestId: string,
  src: string,
  mimeType: 'image/png' | 'image/jpeg',
): Response | null {
  const actualMime = dataUrlMime(src)
  if (actualMime !== mimeType) {
    return ApiErrors.validation(requestId, 'La imagen no coincide con su MIME')
  }
  const size = byteSize(src)
  if (size > MAX_STAMP_ASSET_BYTES) {
    return ApiErrors.payloadTooLarge(requestId, 'Firma o timbre demasiado grande')
  }
  return null
}

function stampStorageKey(userId: string, id: string): string {
  return `pdf_stamp_assets/${userId}/${id}`
}

export default withObservability(
  'pdf-stamp-assets',
  async (req: Request, context: Context, { requestId }) => {
    const authedUser = await getAuthedUser(req, {
      operation: 'pdf-stamp-assets',
      requestId,
    })
    const userId = authedUser.id
    const id = context.params.id
    const pathname = new URL(req.url).pathname
    const sql = getSql()

    if (req.method === 'GET' && !id) {
      const rows = await sqlTyped<StampAssetRow>(sql`
        SELECT id, user_id, kind, name, src, mime_type, width, height, byte_size,
               created_at, updated_at, last_used_at
        FROM pdf_stamp_assets
        WHERE user_id = ${userId} AND deleted_at IS NULL
        ORDER BY updated_at DESC, id DESC
      `)
      return Response.json(rows)
    }

    if (req.method === 'POST' && !id) {
      await ensureUserRow(sql, authedUser)
      const parsed = await parseJsonBody(req, StampAssetCreateBody, requestId)
      if (!parsed.ok) return parsed.response
      const body = parsed.data
      const validationError = validateImageDataUrl(requestId, body.src, body.mimeType)
      if (validationError) return validationError
      const size = byteSize(body.src)
      const rows = await sqlTyped<StampAssetRow>(sql`
        INSERT INTO pdf_stamp_assets (
          id, user_id, kind, name, src, mime_type, width, height, byte_size
        )
        VALUES (
          ${body.id}, ${userId}, ${body.kind}, ${body.name}, ${body.src},
          ${body.mimeType}, ${body.width}, ${body.height}, ${size}
        )
        ON CONFLICT (user_id, id) DO UPDATE
        SET kind = EXCLUDED.kind,
            name = EXCLUDED.name,
            src = EXCLUDED.src,
            mime_type = EXCLUDED.mime_type,
            width = EXCLUDED.width,
            height = EXCLUDED.height,
            byte_size = EXCLUDED.byte_size,
            deleted_at = NULL,
            updated_at = NOW(),
            last_used_at = NOW()
        RETURNING id, user_id, kind, name, src, mime_type, width, height,
                  byte_size, created_at, updated_at, last_used_at
      `)
      await recordStorageAsset(
        sql,
        {
          userId,
          domain: 'pdf-stamp-assets',
          ownerType: 'pdf-stamp-asset',
          ownerId: body.id,
          provider: 'postgres-data-url',
          storageKey: stampStorageKey(userId, body.id),
          mimeType: body.mimeType,
          byteSize: size,
          checksum: checksumSha256(body.src),
        },
        { requestId, operation: 'pdf-stamp-assets.create' },
      )
      return Response.json(rows[0], { status: 201 })
    }

    if (req.method === 'PATCH' && id) {
      const parsed = await parseJsonBody(req, StampAssetPatchBody, requestId)
      if (!parsed.ok) return parsed.response
      const rows = await sqlTyped<StampAssetRow>(sql`
        UPDATE pdf_stamp_assets
        SET name = ${parsed.data.name}, updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id, user_id, kind, name, src, mime_type, width, height,
                  byte_size, created_at, updated_at, last_used_at
      `)
      if (rows.length === 0) {
        return ApiErrors.notFound(requestId, 'Firma o timbre no encontrado')
      }
      return Response.json(rows[0])
    }

    if (req.method === 'POST' && id && pathname.endsWith('/touch')) {
      const rows = await sqlTyped<StampAssetRow>(sql`
        UPDATE pdf_stamp_assets
        SET last_used_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id, user_id, kind, name, src, mime_type, width, height,
                  byte_size, created_at, updated_at, last_used_at
      `)
      if (rows.length === 0) {
        return ApiErrors.notFound(requestId, 'Firma o timbre no encontrado')
      }
      return Response.json(rows[0])
    }

    if (req.method === 'DELETE' && id) {
      const rows = await sqlTyped<{ id: string }>(sql`
        UPDATE pdf_stamp_assets
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ${id} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id
      `)
      if (rows.length === 0) {
        return ApiErrors.notFound(requestId, 'Firma o timbre no encontrado')
      }
      await softDeleteStorageAsset(sql, {
        userId,
        domain: 'pdf-stamp-assets',
        provider: 'postgres-data-url',
        storageKey: stampStorageKey(userId, id),
      })
      return Response.json({ ok: true })
    }

    return ApiErrors.methodNotAllowed(requestId)
  },
)
