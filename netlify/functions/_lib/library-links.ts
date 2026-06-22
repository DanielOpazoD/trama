/**
 * Servicio de dominio de las CONEXIONES de la Biblioteca: escrituras y lecturas
 * sobre `library_item_links`, la tabla que vincula un item de Biblioteca con
 * objetos de dominio (entidad, nota, momento) — el "¿dónde aparece este archivo?".
 *
 * Espeja `library-overrides.ts` (lógica pura de validación separada de la query)
 * y el idioma de `momento_entities`: alta vía upsert `ON CONFLICT ... DO UPDATE
 * SET deleted_at = NULL` (revive un vínculo borrado), baja vía soft-delete.
 *
 * La clave del item (item_kind, item_id) la valida `normalizeItemKey` reusado de
 * `library-overrides`; acá añadimos la validación del destino (target_kind/id).
 */

import { sqlTyped, type SqlClient } from './db.js'
import { LibraryOverrideValidationError, normalizeItemKey } from './library-overrides.js'

/** Tipos de objeto vinculable (espejo del CHECK de la migración). */
export const LINK_TARGET_KINDS = ['entidad', 'nota', 'momento'] as const

export type LibraryLinkTargetKind = (typeof LINK_TARGET_KINDS)[number]

/** Tope de longitud del id del destino (espejo del CHECK de la migración). */
export const TARGET_ID_MAX = 300

/** Fila de vínculo enriquecida con el título del destino (frontera snake_case). */
export type LibraryLinkRow = {
  id: string
  target_kind: LibraryLinkTargetKind
  target_id: string
  target_title: string | null
  created_at: string
}

/** ¿Es uno de los 3 target_kind admitidos? (type guard) */
export function isLibraryLinkTargetKind(value: unknown): value is LibraryLinkTargetKind {
  return (
    typeof value === 'string' && (LINK_TARGET_KINDS as readonly string[]).includes(value)
  )
}

/**
 * Valida y normaliza la clave del destino. Lanza `LibraryOverrideValidationError`
 * (el mismo tipo que captura el endpoint) si el kind no está permitido o el id
 * está vacío / es demasiado largo.
 */
export function normalizeTargetKey(input: { targetKind: unknown; targetId: unknown }): {
  targetKind: LibraryLinkTargetKind
  targetId: string
} {
  if (!isLibraryLinkTargetKind(input.targetKind)) {
    throw new LibraryOverrideValidationError('target_kind no permitido')
  }
  if (typeof input.targetId !== 'string') {
    throw new LibraryOverrideValidationError('target_id requerido')
  }
  const targetId = input.targetId.trim()
  if (targetId.length < 1 || targetId.length > TARGET_ID_MAX) {
    throw new LibraryOverrideValidationError(
      `target_id debe tener entre 1 y ${TARGET_ID_MAX} caracteres`,
    )
  }
  return { targetKind: input.targetKind, targetId }
}

/**
 * Crea (o revive) un vínculo item↔destino. El INSERT lista `user_id` explícito
 * (contrato `check:user-id-writes`); en conflicto reactiva el vínculo borrado
 * (`deleted_at = NULL`) — idempotente, como `momento_entities`.
 */
export async function linkLibraryItem(
  sql: SqlClient,
  input: {
    userId: string
    itemKind: unknown
    itemId: unknown
    targetKind: unknown
    targetId: unknown
  },
): Promise<{ id: string } | null> {
  const { itemKind, itemId } = normalizeItemKey(input)
  const { targetKind, targetId } = normalizeTargetKey(input)

  const rows = await sqlTyped<{ id: string }>(sql`
    INSERT INTO library_item_links (
      user_id, item_kind, item_id, target_kind, target_id
    )
    VALUES (
      ${input.userId}, ${itemKind}, ${itemId}, ${targetKind}, ${targetId}
    )
    ON CONFLICT (user_id, item_kind, item_id, target_kind, target_id)
    DO UPDATE SET
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING id
  `)
  return rows[0] ?? null
}

/**
 * Quita un vínculo (soft-delete). No es un error si no existe: el UPDATE no toca
 * filas. Filtra por `user_id` (aislamiento explícito además de RLS).
 */
export async function unlinkLibraryItem(
  sql: SqlClient,
  input: {
    userId: string
    itemKind: unknown
    itemId: unknown
    targetKind: unknown
    targetId: unknown
  },
): Promise<void> {
  const { itemKind, itemId } = normalizeItemKey(input)
  const { targetKind, targetId } = normalizeTargetKey(input)

  await sql`
    UPDATE library_item_links
    SET deleted_at = NOW(), updated_at = NOW()
    WHERE user_id = ${input.userId}
      AND item_kind = ${itemKind}
      AND item_id = ${itemId}
      AND target_kind = ${targetKind}
      AND target_id = ${targetId}
      AND deleted_at IS NULL
  `
}

/**
 * Lista los vínculos VIVOS de un item, enriquecidos con el título del destino vía
 * LEFT JOIN a cada tabla de origen (entidad→name, nota→title|content, momento→
 * payload.caption|title). Un destino borrado deja `target_title` en NULL (el
 * cliente muestra un texto de respaldo). Más recientes primero.
 */
export async function listLibraryItemLinks(
  sql: SqlClient,
  input: { userId: string; itemKind: unknown; itemId: unknown },
): Promise<LibraryLinkRow[]> {
  const { itemKind, itemId } = normalizeItemKey(input)

  return sqlTyped<LibraryLinkRow>(sql`
    SELECT
      l.id,
      l.target_kind,
      l.target_id,
      CASE l.target_kind
        WHEN 'entidad' THEN e.name
        WHEN 'nota' THEN COALESCE(NULLIF(n.title, ''), NULLIF(LEFT(n.content, 80), ''))
        WHEN 'momento' THEN COALESCE(
          NULLIF(m.payload->>'caption', ''),
          NULLIF(m.payload->>'title', '')
        )
      END AS target_title,
      l.created_at
    FROM library_item_links l
    LEFT JOIN entities e
      ON l.target_kind = 'entidad'
      AND e.id::text = l.target_id
      AND e.user_id = l.user_id
      AND e.deleted_at IS NULL
    LEFT JOIN notes n
      ON l.target_kind = 'nota'
      AND n.id::text = l.target_id
      AND n.user_id = l.user_id
      AND n.deleted_at IS NULL
    LEFT JOIN momentos m
      ON l.target_kind = 'momento'
      AND m.id::text = l.target_id
      AND m.user_id = l.user_id
      AND m.deleted_at IS NULL
    WHERE l.user_id = ${input.userId}
      AND l.item_kind = ${itemKind}
      AND l.item_id = ${itemId}
      AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC
  `)
}
