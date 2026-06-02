import type { SqlClient } from './db.js'
import { sqlTyped } from './db.js'

export type AttachmentOwnerType = 'note' | 'prompt'

export async function attachmentOwnerExists(
  sql: SqlClient,
  ownerType: AttachmentOwnerType,
  ownerId: string,
  userId: string,
): Promise<boolean> {
  if (ownerType === 'note') {
    const rows = await sqlTyped<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM notes
        WHERE id = ${ownerId} AND user_id = ${userId} AND deleted_at IS NULL
      ) AS exists
    `)
    return rows[0]?.exists === true
  }

  const rows = await sqlTyped<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM prompts
      WHERE id = ${ownerId} AND user_id = ${userId} AND deleted_at IS NULL
    ) AS exists
  `)
  return rows[0]?.exists === true
}
