/**
 * Historial de versiones de los prompts.
 *
 * Un prompt se afina editándolo, y cada edición pisaba la anterior sin dejar
 * rastro: si la nueva redacción salía peor, la que funcionaba ya no existía.
 * Aquí queda registrada la versión ANTERIOR en cada guardado que cambie el
 * texto — no los cambios de favorito ni el contador de usos, que no son nada
 * que se pueda perder.
 *
 * Dos invariantes que dan toda la garantía:
 *
 *  1. **El snapshot y la escritura son el mismo statement.** Van en una CTE, así
 *     que no existe el instante en el que el texto viejo ya se pisó pero
 *     todavía no se guardó. Las sub-sentencias de una CTE ven la MISMA foto de
 *     la base, de modo que el INSERT lee la fila previa aunque el UPDATE la
 *     esté cambiando en la misma pasada.
 *  2. **Restaurar no destruye.** Restaurar es una edición más, así que guarda
 *     antes lo que había. Se puede ir y volver sin perder ninguno de los dos.
 *
 * Vive aparte de `prompts.mts` porque editar y restaurar comparten exactamente
 * el mismo camino de escritura: la diferencia entre ambos es de dónde salen los
 * valores, no qué hay que hacer con ellos.
 */

import { sqlTyped, type SqlClient } from './db.js'
import { parseTags } from './note-tags.js'
import { extractPromptVariables } from './prompt-vars.js'

/**
 * Cuántas versiones se conservan por prompt. Son unos pocos KB de texto cada
 * una; el límite existe para que un prompt editado a diario durante años no
 * crezca sin techo, no para ahorrar espacio.
 */
export const MAX_PROMPT_VERSIONS = 50

export type PromptVersionRow = {
  id: string
  title: string
  content: string
  collection: string | null
  created_at: string
}

export type PromptHeadRow = {
  id: string
  title: string
  content: string
  collection: string | null
  tags: string[]
  variables: string[]
  favorite: boolean
  use_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

/** Los tres campos que forman el texto versionable de un prompt. */
export type PromptText = {
  title: string
  content: string
  collection: string | null
}

/** Tags derivadas del texto, igual que en el alta. */
export function tagsFor(text: PromptText): string[] {
  return parseTags(`${text.title}\n${text.content}\n${text.collection ?? ''}`)
}

/** ¿Cambió algo que merezca quedar registrado? */
export function textChanged(before: PromptText, after: PromptText): boolean {
  return (
    before.title !== after.title ||
    before.content !== after.content ||
    before.collection !== after.collection
  )
}

/** El texto actual del prompt, o null si no existe o no es de este usuario. */
export async function readPromptText(
  sql: SqlClient,
  userId: string,
  promptId: string,
): Promise<PromptText | null> {
  const rows = await sqlTyped<PromptText>(sql`
    SELECT title, content, collection
    FROM prompts
    WHERE id = ${promptId} AND deleted_at IS NULL AND user_id = ${userId}
  `)
  return rows[0] ?? null
}

/** Lo que un PATCH puede cambiar de un prompt. */
export type PromptPatch = {
  title?: string
  content?: string
  collection?: string | null
  favorite?: boolean
  useCount?: number
}

/**
 * Aplica un patch y, si cambia el texto, guarda la versión anterior en el mismo
 * statement.
 *
 * Es el ÚNICO camino de escritura del prompt: lo usan tanto editar como
 * restaurar. Que restaurar pase por aquí es lo que hace que restaurar no
 * destruya — guarda lo que había antes de pisarlo, igual que cualquier otra
 * edición.
 *
 * Devuelve `null` si el prompt no existe o no es de este usuario.
 */
export async function applyPromptPatch(
  sql: SqlClient,
  userId: string,
  promptId: string,
  patch: PromptPatch,
): Promise<PromptHeadRow | null> {
  const tocaTexto =
    patch.title !== undefined ||
    patch.content !== undefined ||
    patch.collection !== undefined

  let tags: string[] | null = null
  let variables: string[] | null = null
  let snapshot = false

  if (tocaTexto) {
    const actual = await readPromptText(sql, userId, promptId)
    if (!actual) return null
    const siguiente: PromptText = {
      title: patch.title ?? actual.title,
      content: patch.content ?? actual.content,
      collection: patch.collection !== undefined ? patch.collection : actual.collection,
    }
    tags = tagsFor(siguiente)
    variables = extractPromptVariables(siguiente.content)
    snapshot = textChanged(actual, siguiente)
  }

  const rows = await sqlTyped<PromptHeadRow>(sql`
    WITH snapshot AS (
      INSERT INTO prompt_versions (user_id, prompt_id, title, content, collection)
      SELECT ${userId}, ${promptId}, title, content, collection
      FROM prompts
      WHERE id = ${promptId} AND deleted_at IS NULL AND user_id = ${userId}
        AND ${snapshot}
      RETURNING 1
    )
    UPDATE prompts
    SET title = COALESCE(${patch.title ?? null}, title),
        content = COALESCE(${patch.content ?? null}, content),
        collection = CASE WHEN ${patch.collection !== undefined} THEN ${patch.collection ?? null} ELSE collection END,
        tags = CASE WHEN ${tags !== null} THEN ${tags ?? []}::text[] ELSE tags END,
        variables = CASE WHEN ${variables !== null} THEN ${variables ?? []}::text[] ELSE variables END,
        favorite = CASE
                     WHEN ${patch.favorite === true} THEN true
                     WHEN ${patch.favorite === false} THEN false
                     ELSE favorite
                   END,
        use_count = COALESCE(${patch.useCount ?? null}, use_count),
        updated_at = NOW()
    WHERE id = ${promptId} AND deleted_at IS NULL AND user_id = ${userId}
    RETURNING id, title, content, collection, tags, variables, favorite, use_count, last_used_at, created_at, updated_at
  `)
  const row = rows[0] ?? null
  if (row && snapshot) await prunePromptVersions(sql, userId, promptId)
  return row
}

/**
 * Baja las versiones que sobran del tope de retención. Housekeeping idempotente
 * tras cada snapshot; soft delete, como el resto del dominio.
 */
export async function prunePromptVersions(
  sql: SqlClient,
  userId: string,
  promptId: string,
): Promise<void> {
  await sql`
    UPDATE prompt_versions
    SET deleted_at = NOW()
    WHERE id IN (
      SELECT id FROM prompt_versions
      WHERE user_id = ${userId}
        AND prompt_id = ${promptId}
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      OFFSET ${MAX_PROMPT_VERSIONS}
    )
      AND user_id = ${userId}
  `
}

/** Historial de un prompt, de la versión más reciente a la más antigua. */
export async function listPromptVersions(
  sql: SqlClient,
  userId: string,
  promptId: string,
): Promise<PromptVersionRow[]> {
  return sqlTyped<PromptVersionRow>(sql`
    SELECT v.id, v.title, v.content, v.collection, v.created_at
    FROM prompt_versions v
    JOIN prompts p ON p.id = v.prompt_id
    WHERE v.prompt_id = ${promptId}
      AND v.user_id = ${userId}
      AND v.deleted_at IS NULL
      AND p.user_id = ${userId}
      AND p.deleted_at IS NULL
    ORDER BY v.created_at DESC, v.id DESC
  `)
}

/** El texto de una versión concreta, o null si no es del usuario o no existe. */
export async function readPromptVersion(
  sql: SqlClient,
  userId: string,
  promptId: string,
  versionId: string,
): Promise<PromptText | null> {
  const rows = await sqlTyped<PromptText>(sql`
    SELECT title, content, collection
    FROM prompt_versions
    WHERE id = ${versionId}
      AND prompt_id = ${promptId}
      AND user_id = ${userId}
      AND deleted_at IS NULL
  `)
  return rows[0] ?? null
}
