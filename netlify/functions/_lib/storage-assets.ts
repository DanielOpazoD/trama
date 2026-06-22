import { createHash } from 'node:crypto'
import { sqlTyped, type SqlClient } from './db.js'
import { logOperationalEvent } from './operational-events.js'

export type StorageAssetDomain =
  | 'notas-attachments'
  | 'momentos-media'
  | 'recortes-media'
  | 'pdf-studio-saved-pdfs'
  | 'pdf-stamp-assets'
  | 'library-uploads'

export type StorageAssetProvider = 'netlify-blobs' | 'postgres-data-url'

export type StorageAssetInput = {
  userId: string
  domain: StorageAssetDomain
  ownerType: string
  ownerId: string
  provider: StorageAssetProvider
  storageKey: string
  mimeType: string
  byteSize: number
  checksum: string | null
  /**
   * Fecha de creación explícita (ISO). Sirve para anclar la fila a una fecha de
   * captura (EXIF / lastModified) en vez de la hora de subida — la Biblioteca
   * ordena/posiciona por `created_at`. Si se omite, la DB usa `NOW()`.
   */
  createdAt?: string | null
}

export type StorageAssetDeleteInput = {
  userId: string
  domain: StorageAssetDomain
  provider: StorageAssetProvider
  storageKey: string
}

export type StorageAssetRecordOptions = {
  requestId?: string
  operation?: string
}

function sha256Hex(value: string | ArrayBuffer | Uint8Array): string {
  const hash = createHash('sha256')
  if (typeof value === 'string') hash.update(value)
  else
    hash.update(Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)))
  return hash.digest('hex')
}

export function checksumSha256(bytes: string | ArrayBuffer | Uint8Array): string {
  return `sha256:${sha256Hex(bytes)}`
}

export function storageKeyForLog(storageKey: string): {
  ownerPrefix: string | null
  keyHash: string
} {
  const slash = storageKey.indexOf('/')
  return {
    ownerPrefix: slash > 0 ? storageKey.slice(0, slash) : null,
    keyHash: `sha256:${sha256Hex(storageKey)}`,
  }
}

export async function recordStorageAsset(
  sql: SqlClient,
  input: StorageAssetInput,
  options: StorageAssetRecordOptions = {},
): Promise<string | null> {
  try {
    // `created_at` solo se setea explícito si llega `createdAt`; si no, cae al
    // default NOW() de la tabla (COALESCE deja pasar el NULL al default).
    const createdAt = input.createdAt ?? null
    const rows = await sqlTyped<{ id: string }>(sql`
      INSERT INTO storage_assets (
        user_id, domain, owner_type, owner_id, provider, storage_key,
        mime_type, byte_size, checksum, created_at
      )
      VALUES (
        ${input.userId}, ${input.domain}, ${input.ownerType}, ${input.ownerId},
        ${input.provider}, ${input.storageKey}, ${input.mimeType}, ${input.byteSize},
        ${input.checksum}, COALESCE(${createdAt}::timestamptz, NOW())
      )
      ON CONFLICT (provider, domain, storage_key)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        owner_type = EXCLUDED.owner_type,
        owner_id = EXCLUDED.owner_id,
        mime_type = EXCLUDED.mime_type,
        byte_size = EXCLUDED.byte_size,
        checksum = EXCLUDED.checksum,
        deleted_at = NULL,
        updated_at = NOW()
      RETURNING id
    `)
    return rows[0]?.id ?? null
  } catch (err) {
    const safeKey = storageKeyForLog(input.storageKey)
    logOperationalEvent({
      event: 'storage.manifest.failed',
      severity: 'error',
      requestId: options.requestId,
      operation: options.operation ?? 'storage.manifest.write',
      userId: input.userId,
      reason: 'record_storage_asset_failed',
      details: {
        domain: input.domain,
        provider: input.provider,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        ownerPrefix: safeKey.ownerPrefix,
        keyHash: safeKey.keyHash,
        errorName: err instanceof Error ? err.name : 'UnknownError',
      },
    })
    throw err
  }
}

export async function softDeleteStorageAsset(
  sql: SqlClient,
  input: StorageAssetDeleteInput,
): Promise<string | null> {
  const rows = await sqlTyped<{ id: string }>(sql`
    UPDATE storage_assets
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE user_id = ${input.userId}
      AND domain = ${input.domain}
      AND provider = ${input.provider}
      AND storage_key = ${input.storageKey}
      AND deleted_at IS NULL
    RETURNING id
  `)
  return rows[0]?.id ?? null
}
