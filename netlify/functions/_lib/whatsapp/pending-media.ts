import { pickOldestCapturedAt } from '../../../../src/lib/photoExif.js'
import { copyRecorteImageToStore, removeBlob } from '../recorte-to-momento.js'
import { sqlTyped, type SqlClient } from '../db.js'
import {
  persistImageMomentoEpisode,
  persistImageRecorte,
  persistImageRecorteEvent,
} from './persist-media.js'
import { captureDeepLink } from './deep-link.js'
import { persistWhatsAppEvent } from './events.js'

export type PendingMediaImage = {
  key: string
  mime: string
  capturedAt?: string | null
}

type PendingMediaRow = {
  id: string
  storage_key: string
  mime: string
  captured_at: string | null
  caption: string
}

export type PendingMediaDestination = 'momento' | 'recorte'

export type PendingMediaResolution = {
  kind: PendingMediaDestination
  id: string
  message: string
} | null

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function pendingMediaDestinationFromText(
  text: string,
): PendingMediaDestination | null {
  const normalized = fold(text).replace(/\s+/g, ' ')
  if (/^(a\s+)?momentos?$/.test(normalized)) return 'momento'
  if (/^(a\s+)?recortes?$/.test(normalized)) return 'recorte'
  return null
}

export function pendingMediaPrompt(count: number): string {
  const noun = count === 1 ? 'foto' : 'fotos'
  return `Recibí ${count} ${noun} sin mensaje. ¿Dónde la guardo? Responde «momento» o «recorte».`
}

export async function storePendingMedia(
  sql: SqlClient,
  userId: string,
  phone: string,
  images: PendingMediaImage[],
  caption = '',
): Promise<number> {
  if (images.length === 0) return 0
  const groupId = crypto.randomUUID()
  const keys = images.map((image) => image.key)
  const mimes = images.map((image) => image.mime)
  const capturedAts = images.map((image) => image.capturedAt ?? null)
  const rows = await sqlTyped<{ n: number }>(sql`
    INSERT INTO whatsapp_pending_media (
      user_id, phone_e164, group_id, storage_key, mime, captured_at, caption
    )
    SELECT ${userId}, ${phone}, ${groupId}::uuid, x.key, x.mime,
      x.captured_at::timestamptz, ${caption}
    FROM unnest(${keys}::text[], ${mimes}::text[], ${capturedAts}::text[])
      AS x(key, mime, captured_at)
    RETURNING 1 AS n
  `)
  return rows.length
}

export async function maybeStorePendingMediaPrompt(
  sql: SqlClient,
  userId: string,
  phone: string,
  options: {
    route: string
    body: string
    grouping: string
    recorteImages: PendingMediaImage[]
    momentoImageCount: number
  },
): Promise<string | null> {
  const shouldAsk =
    options.route === 'recorte' &&
    options.body.trim() === '' &&
    options.grouping !== 'append' &&
    options.recorteImages.length > 0 &&
    options.momentoImageCount === 0
  if (!shouldAsk) return null

  const pendingCount = await storePendingMedia(sql, userId, phone, options.recorteImages)
  await persistWhatsAppEvent(sql, userId, {
    event: 'capture',
    ok: true,
    detail: 'pending_media_destination',
  })
  return pendingMediaPrompt(pendingCount || options.recorteImages.length)
}

async function readPendingMedia(
  sql: SqlClient,
  userId: string,
  phone: string,
): Promise<PendingMediaRow[]> {
  return sqlTyped<PendingMediaRow>(sql`
    WITH latest AS (
      SELECT group_id
      FROM whatsapp_pending_media
      WHERE user_id = ${userId}
        AND phone_e164 = ${phone}
        AND consumed_at IS NULL
        AND deleted_at IS NULL
        AND created_at > NOW() - interval '15 minutes'
      ORDER BY created_at DESC
      LIMIT 1
    )
    SELECT id, storage_key, mime, captured_at, caption
    FROM whatsapp_pending_media
    WHERE user_id = ${userId}
      AND group_id = (SELECT group_id FROM latest)
      AND consumed_at IS NULL
      AND deleted_at IS NULL
    ORDER BY created_at ASC, id ASC
  `)
}

async function consumePendingMedia(
  sql: SqlClient,
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return
  await sqlTyped<{ n: number }>(sql`
    UPDATE whatsapp_pending_media
    SET consumed_at = NOW()
    WHERE user_id = ${userId} AND id = ANY(${ids}::uuid[])
    RETURNING 1 AS n
  `)
}

export async function resolvePendingMediaDestination(
  sql: SqlClient,
  userId: string,
  phone: string,
  destination: PendingMediaDestination,
  origin: string,
): Promise<PendingMediaResolution> {
  const rows = await readPendingMedia(sql, userId, phone)
  if (rows.length === 0) return null

  const caption = rows.find((row) => row.caption.trim())?.caption ?? ''
  const ids = rows.map((row) => row.id)

  if (destination === 'recorte') {
    const images = rows.map((row) => ({ key: row.storage_key, mime: row.mime }))
    const result =
      images.length === 1
        ? await persistImageRecorte(sql, userId, images[0]!.key, caption)
        : await persistImageRecorteEvent(sql, userId, images, caption)
    if (!result.id) throw new Error('pending_media_recorte_missing_id')
    await consumePendingMedia(sql, userId, ids)
    return {
      kind: 'recorte',
      id: result.id,
      message: `✅ Guardado en Recortes.\n🔗 Ábrelo en Trama: ${captureDeepLink(origin, 'recorte')}`,
    }
  }

  const copied: string[] = []
  try {
    for (const row of rows) {
      const copy = await copyRecorteImageToStore(
        'momentos-media',
        row.storage_key,
        userId,
      )
      if (!copy) throw new Error('pending_media_blob_missing')
      copied.push(copy.storageKey)
    }
    const result = await persistImageMomentoEpisode(
      sql,
      userId,
      copied,
      caption,
      pickOldestCapturedAt(rows.map((row) => row.captured_at)),
    )
    if (!result.id) throw new Error('pending_media_momento_missing_id')
    await consumePendingMedia(sql, userId, ids)
    for (const row of rows) {
      removeBlob('recortes-media', row.storage_key).catch(() => {})
    }
    return {
      kind: 'momento',
      id: result.id,
      message: `✅ Guardado en Momentos.\n🔗 Ábrelo en Trama: ${captureDeepLink(origin, 'momento')}`,
    }
  } catch (err) {
    for (const key of copied) {
      await removeBlob('momentos-media', key)
    }
    throw err
  }
}
