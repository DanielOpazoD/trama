/**
 * Servicio de dominio de la Biblioteca: escrituras sobre `library_item_overrides`,
 * la capa decoradora que añade metadata propia (renombrar, papelera) a los
 * archivos que ya viven en otras tablas, SIN tocar el blob ni la fila nativa.
 *
 * Es la contraparte de escritura de `library-read-model.ts` (que solo lee):
 *   - `renameLibraryItem`     → upsert `display_title` (el read-model ya hace
 *                               `COALESCE(display_title, title_native)`).
 *   - `setLibraryItemDeleted` → upsert `deleted_at = NOW()/NULL` (borrado suave
 *                               A NIVEL BIBLIOTECA; reversible, no destruye nada).
 *
 * Ambas son upserts `INSERT ... ON CONFLICT (user_id, item_kind, item_id) DO
 * UPDATE` espejando `recordStorageAsset`. La clave lógica es (item_kind,
 * item_id); el override es por usuario y el read-model solo lo aplica a los
 * items del propio usuario, así que un override sobre un item ajeno es inocuo
 * (nunca matchea). Igual validamos kind/longitudes para no ensuciar la tabla.
 *
 * Lógica pura (validación + normalización) separada de la query, testeable sin
 * DB — sigue `docs/conventions/backend-domain-services.md`.
 */

import { sqlTyped, type SqlClient } from './db.js'

/** Los 6 `item_kind` admitidos (espejo del CHECK de la migración). */
export const LIBRARY_ITEM_KINDS = [
  'library-upload',
  'notas-attachment',
  'recorte-image',
  'momento-foto',
  'pdf-saved',
  'pdf-stamp',
] as const

export type LibraryItemKind = (typeof LIBRARY_ITEM_KINDS)[number]

/** Límites de longitud (espejo de los CHECK de la migración). */
export const ITEM_ID_MAX = 300
export const DISPLAY_TITLE_MAX = 400

/** Fila del override que devuelven los upserts (snake_case, frontera con PG). */
export type LibraryOverrideRow = {
  id: string
  item_kind: LibraryItemKind
  item_id: string
  display_title: string | null
  deleted_at: string | null
  updated_at: string
}

export class LibraryOverrideValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LibraryOverrideValidationError'
  }
}

/** ¿Es uno de los 6 kinds admitidos? (type guard) */
export function isLibraryItemKind(value: unknown): value is LibraryItemKind {
  return (
    typeof value === 'string' && (LIBRARY_ITEM_KINDS as readonly string[]).includes(value)
  )
}

/**
 * Valida y normaliza la clave lógica del item. Lanza
 * `LibraryOverrideValidationError` si el kind no está permitido o el id está
 * vacío / es demasiado largo. Devuelve el id intacto (no se recorta: es una
 * clave, no texto editable).
 */
export function normalizeItemKey(input: { itemKind: unknown; itemId: unknown }): {
  itemKind: LibraryItemKind
  itemId: string
} {
  if (!isLibraryItemKind(input.itemKind)) {
    throw new LibraryOverrideValidationError('item_kind no permitido')
  }
  if (typeof input.itemId !== 'string') {
    throw new LibraryOverrideValidationError('item_id requerido')
  }
  const itemId = input.itemId
  if (itemId.length < 1 || itemId.length > ITEM_ID_MAX) {
    throw new LibraryOverrideValidationError(
      `item_id debe tener entre 1 y ${ITEM_ID_MAX} caracteres`,
    )
  }
  return { itemKind: input.itemKind, itemId }
}

/**
 * Valida y normaliza el título a renombrar: recorta espacios y exige 1..400
 * tras el trim (un título de solo espacios no es válido). Devuelve el título
 * listo para persistir.
 */
export function normalizeDisplayTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new LibraryOverrideValidationError('display_title requerido')
  }
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > DISPLAY_TITLE_MAX) {
    throw new LibraryOverrideValidationError(
      `display_title debe tener entre 1 y ${DISPLAY_TITLE_MAX} caracteres`,
    )
  }
  return trimmed
}

/**
 * Renombra un item: upsert del `display_title` en el override. El INSERT lista
 * `user_id` explícito (contrato `check:user-id-writes`); en conflicto solo toca
 * `display_title` + `updated_at` (no resucita `deleted_at` ni pisa tags/pinned).
 */
export async function renameLibraryItem(
  sql: SqlClient,
  input: { userId: string; itemKind: unknown; itemId: unknown; displayTitle: unknown },
): Promise<LibraryOverrideRow | null> {
  const { itemKind, itemId } = normalizeItemKey(input)
  const displayTitle = normalizeDisplayTitle(input.displayTitle)

  const rows = await sqlTyped<LibraryOverrideRow>(sql`
    INSERT INTO library_item_overrides (
      user_id, item_kind, item_id, display_title
    )
    VALUES (
      ${input.userId}, ${itemKind}, ${itemId}, ${displayTitle}
    )
    ON CONFLICT (user_id, item_kind, item_id)
    DO UPDATE SET
      display_title = EXCLUDED.display_title,
      updated_at = NOW()
    RETURNING id, item_kind, item_id, display_title, deleted_at, updated_at
  `)
  return rows[0] ?? null
}

/**
 * Manda un item a la papelera de la Biblioteca (`deleted` = true → `deleted_at =
 * NOW()`) o lo restaura (`deleted` = false → `deleted_at = NULL`). Upsert: si el
 * item aún no tiene override, lo crea con la marca correspondiente. En conflicto
 * solo toca `deleted_at` + `updated_at` (preserva título/tags/pinned).
 *
 * No toca la tabla de origen: es un ocultar reversible a nivel Biblioteca.
 */
export async function setLibraryItemDeleted(
  sql: SqlClient,
  input: { userId: string; itemKind: unknown; itemId: unknown; deleted: boolean },
): Promise<LibraryOverrideRow | null> {
  const { itemKind, itemId } = normalizeItemKey(input)
  const deletedAt = input.deleted ? new Date().toISOString() : null

  const rows = await sqlTyped<LibraryOverrideRow>(sql`
    INSERT INTO library_item_overrides (
      user_id, item_kind, item_id, deleted_at
    )
    VALUES (
      ${input.userId}, ${itemKind}, ${itemId}, ${deletedAt}::timestamptz
    )
    ON CONFLICT (user_id, item_kind, item_id)
    DO UPDATE SET
      deleted_at = ${deletedAt}::timestamptz,
      updated_at = NOW()
    RETURNING id, item_kind, item_id, display_title, deleted_at, updated_at
  `)
  return rows[0] ?? null
}
