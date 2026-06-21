import type { z } from 'zod'
import { getSql, sqlTyped } from './db.js'
import type { RecorteCreateBody, RecortePatchBody } from './recorte-schemas.js'
import {
  buildRecorteCreateDraft,
  buildRecortePatchDraft,
  type RecorteRow,
} from './recortes-service.js'

type Sql = ReturnType<typeof getSql>
type RecorteCreateInput = z.infer<typeof RecorteCreateBody>
type RecortePatchInput = z.infer<typeof RecortePatchBody>

export async function restoreRecorte(
  sql: Sql,
  id: string,
  userId: string,
  deletedAt: string,
): Promise<boolean> {
  const rows = await sqlTyped<{ restored: boolean }>(sql`
    WITH restore_recorte AS (
      UPDATE recortes SET deleted_at = NULL, updated_at = NOW()
      WHERE id = ${id} AND deleted_at = ${deletedAt} AND user_id = ${userId}
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM restore_recorte) AS restored
  `)
  return !!rows[0]?.restored
}

export async function listRecortes(
  sql: Sql,
  userId: string,
  statusFilter: 'pending' | 'promoted' | 'archived' | null,
): Promise<RecorteRow[]> {
  return sqlTyped<RecorteRow>(sql`
    SELECT id, text, source_url, source_title, source_author, note,
      image_url, image_key, capture_mode, status, promoted_target,
      promoted_id, source, captured_at, created_at, updated_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('storage_key', ri.storage_key) ORDER BY ri.position)
        FROM recorte_images ri
        WHERE ri.recorte_id = recortes.id AND ri.user_id = ${userId}
      ), '[]'::jsonb) AS images
    FROM recortes
    WHERE deleted_at IS NULL AND user_id = ${userId}
      AND (${statusFilter}::text IS NULL OR status = ${statusFilter})
    ORDER BY created_at DESC, id DESC
    LIMIT 500
  `)
}

export async function createRecorte(
  sql: Sql,
  userId: string,
  input: RecorteCreateInput,
): Promise<RecorteRow | undefined> {
  const b = buildRecorteCreateDraft(input)
  const rows = await sqlTyped<RecorteRow>(sql`
    INSERT INTO recortes (
      text, source_url, source_title, source_author, note, image_url,
      image_key, capture_mode, captured_at, user_id
    ) VALUES (
      ${b.text}, ${b.sourceUrl}, ${b.sourceTitle},
      ${b.sourceAuthor}, ${b.note}, ${b.imageUrl},
      ${b.imageKey}, ${b.captureMode},
      ${b.capturedAt}::timestamptz, ${userId}
    )
    RETURNING id, text, source_url, source_title, source_author, note,
      image_url, image_key, capture_mode, status, promoted_target,
      promoted_id, captured_at, created_at, updated_at
  `)
  return rows[0]
}

export async function patchRecorte(
  sql: Sql,
  id: string,
  userId: string,
  input: RecortePatchInput,
): Promise<RecorteRow | undefined> {
  const b = buildRecortePatchDraft(input)
  const rows = await sqlTyped<RecorteRow>(sql`
    UPDATE recortes
    SET text = COALESCE(${b.text}, text),
        source_title = COALESCE(${b.sourceTitle}, source_title),
        source_author = COALESCE(${b.sourceAuthor}, source_author),
        image_url = COALESCE(${b.imageUrl}, image_url),
        note = CASE WHEN ${b.noteProvided} THEN ${b.note} ELSE note END,
        status = CASE
                   WHEN ${b.status === 'archived'} THEN 'archived'
                   WHEN ${b.status === 'pending'} THEN 'pending'
                   ELSE status
                 END,
        updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
    RETURNING id, text, source_url, source_title, source_author, note,
      image_url, image_key, capture_mode, status, promoted_target,
      promoted_id, captured_at, created_at, updated_at
  `)
  return rows[0]
}

export async function deleteRecorte(
  sql: Sql,
  id: string,
  userId: string,
): Promise<string | null> {
  const rows = await sqlTyped<{ deleted_at: string }>(sql`
    UPDATE recortes SET deleted_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
    RETURNING deleted_at
  `)
  return rows[0]?.deleted_at ?? null
}
