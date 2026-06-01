/**
 * Crónica de bookmarks: ensayo breve por IA sobre lo que el usuario guarda en
 * X. Prompt puro + helpers de DB. Lo orquesta el endpoint /api/x/cronica.
 */

import { type LLMMessage } from '../llm.js'
import type { SqlClient } from './client.js'

export type CronicaBookmark = {
  text: string
  authorUsername: string | null
  topic: string | null
}

/** Prompt: prosa ensayística (no viñetas, no recomendaciones) sobre los temas. */
export function buildBookmarkCronicaMessages(
  items: ReadonlyArray<CronicaBookmark>,
): LLMMessage[] {
  const sample = items
    .slice(0, 60)
    .map((b, i) => {
      const topic = b.topic ? `[${b.topic}] ` : ''
      const who = b.authorUsername ? `@${b.authorUsername}: ` : ''
      return `${i + 1}. ${topic}${who}${b.text.replace(/\s+/g, ' ').slice(0, 200)}`
    })
    .join('\n')
  return [
    {
      role: 'system',
      content:
        'Sos un cronista que observa lo que esta persona guarda en X (Twitter). ' +
        'Escribí una crónica breve (150-220 palabras), en prosa, en español, sin ' +
        'viñetas ni recomendaciones ni "deberías": qué temas e intereses se asoman ' +
        'en sus marcadores, qué voces sigue, qué obsesiones recientes. Tono ' +
        'ensayístico y cálido. No enumeres; narrá.',
    },
    {
      role: 'user',
      content: `Estos son algunos de mis bookmarks recientes:\n\n${sample}`,
    },
  ]
}

export type StoredXCronica = {
  id: string
  text: string
  source_count: number
  generated_at: string
  provider: string | null
  model: string | null
}

/** Bookmarks recientes (texto + autor + tema) como material de la crónica. */
export async function selectBookmarksForCronica(
  sql: SqlClient,
  userId: string,
  limit: number,
): Promise<CronicaBookmark[]> {
  const rows = (await sql`
    SELECT text, author_username, topic
    FROM x_bookmarks
    WHERE user_id = ${userId} AND deleted_at IS NULL
    ORDER BY captured_at DESC
    LIMIT ${limit}
  `) as Array<{ text: string; author_username: string | null; topic: string | null }>
  return rows.map((r) => ({
    text: r.text,
    authorUsername: r.author_username,
    topic: r.topic,
  }))
}

/** La crónica de bookmarks más reciente del usuario, o null. */
export async function getLatestXCronica(
  sql: SqlClient,
  userId: string,
): Promise<StoredXCronica | null> {
  const rows = (await sql`
    SELECT id, text, source_count, generated_at, provider, model
    FROM x_cronicas
    WHERE user_id = ${userId} AND deleted_at IS NULL
    ORDER BY generated_at DESC
    LIMIT 1
  `) as StoredXCronica[]
  return rows[0] ?? null
}

/** Persiste una crónica nueva y la devuelve. */
export async function insertXCronica(
  sql: SqlClient,
  userId: string,
  data: {
    text: string
    sourceCount: number
    provider: string | null
    model: string | null
  },
): Promise<StoredXCronica> {
  const rows = (await sql`
    INSERT INTO x_cronicas (user_id, text, source_count, provider, model)
    VALUES (${userId}, ${data.text}, ${data.sourceCount}, ${data.provider}, ${data.model})
    RETURNING id, text, source_count, generated_at, provider, model
  `) as StoredXCronica[]
  return rows[0]!
}

/** Soft-delete de TODAS las crónicas vivas del usuario. La vista muestra
    solo la última; "eliminar" debe dejar la sección vacía hasta regenerar. */
export async function softDeleteXCronicas(sql: SqlClient, userId: string): Promise<void> {
  await sql`
    UPDATE x_cronicas
    SET deleted_at = NOW()
    WHERE user_id = ${userId} AND deleted_at IS NULL
  `
}
