import { getSql, sqlTyped } from '../db.js'
import { runWithSystemRls } from '../user-rls.js'
import { parseRows } from '../row-parse.js'
import { toPgVector } from '../embeddings.js'
import type { Origin } from '../origin.js'
import type { MomentoKind } from '../momento-embed.js'
import {
  CurrentMomentoRowSchema,
  DeletedMomentoRowSchema,
  MomentoEntityLinkRowSchema,
  MomentoListRowSchema,
  MomentoResponseRowSchema,
  type CurrentMomentoRow,
  type DeletedMomentoRow,
  type MomentoEntityLinkRow,
  type MomentoListRow,
  type MomentoResponseRow,
} from '../backend-row-schemas.js'

/**
 * Capa de acceso a datos de /api/momentos.
 *
 * Cada función encapsula UNA interacción con la base — el template SQL más su
 * contexto de ejecución (RLS de sistema cuando corresponde) y la validación de
 * filas (`parseRows` + schema). El endpoint queda como orquestación pura; el
 * "cómo se consulta" vive acá, testeable en aislamiento.
 *
 * Extraído verbatim del mega-handler de `momentos-endpoint.ts` — mismos
 * templates, mismo wrapping RLS, mismos tags de parseo. No cambia comportamiento.
 */

type Sql = ReturnType<typeof getSql>

/** Embedding ya calculado por `embedSafe` (o null si no se generó). */
type Embedding = { vector: number[]; model: string } | null

export type EntityIdRow = { id: string }
export type MomentoLinkIdRow = { entity_id: string }

export type MomentosPageParams = {
  limit: number
  validKind: MomentoKind | null
  cursorTs: string | null
  cursorId: string | null
}

// ---------------------------------------------------------------- GET one ----

/** Un momento por id, con su rol de acceso (owner / share). */
export async function loadMomentoById(
  sql: Sql,
  id: string,
  userId: string,
): Promise<MomentoListRow[]> {
  return parseRows(
    await runWithSystemRls(() =>
      sqlTyped<MomentoListRow>(sql`
        SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
               m.created_at, m.updated_at,
               m.user_id AS owner_user_id,
               owner.display_name AS owner_display_name,
               owner.email AS owner_email,
               CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
               (m.user_id <> ${userId}) AS shared
        FROM momentos m
        LEFT JOIN momento_space_access msa
          ON msa.owner_user_id = m.user_id
         AND msa.member_user_id = ${userId}
         AND msa.deleted_at IS NULL
        LEFT JOIN users owner ON owner.id = m.user_id
        WHERE m.id = ${id}
          AND m.deleted_at IS NULL
          AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
      `),
    ),
    MomentoListRowSchema,
    'momentos.get',
  )
}

/**
 * entityIds vinculados a un momento. El JOIN a entities excluye entidades
 * soft-borradas (el link sobrevive y revive al restaurar la entidad).
 */
export async function loadMomentoEntityLinkIds(
  sql: Sql,
  momentoId: string,
  ownerId: string,
): Promise<MomentoLinkIdRow[]> {
  return parseRows(
    await runWithSystemRls(() =>
      sqlTyped<MomentoLinkIdRow>(sql`
        SELECT me.entity_id
        FROM momento_entities me
        JOIN entities e ON e.id = me.entity_id AND e.deleted_at IS NULL
        WHERE me.momento_id = ${momentoId}
          AND me.user_id = ${ownerId}
          AND me.deleted_at IS NULL
      `),
    ),
    MomentoEntityLinkRowSchema.pick({ entity_id: true }),
    'momentos.get.links',
  )
}

// --------------------------------------------------------------- GET list ----

/**
 * Página del timeline. Cuatro variantes según haya cursor y/o filtro de kind —
 * cada una con su propio template para que el planner elija el índice correcto.
 */
export async function listMomentosPage(
  sql: Sql,
  userId: string,
  { limit, validKind, cursorTs, cursorId }: MomentosPageParams,
): Promise<MomentoListRow[]> {
  if (cursorTs && cursorId && validKind) {
    return parseRows(
      await runWithSystemRls(() =>
        sqlTyped<MomentoListRow>(sql`
          SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
                 m.created_at, m.updated_at,
                 m.user_id AS owner_user_id,
                 owner.display_name AS owner_display_name,
                 owner.email AS owner_email,
                 CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
                 (m.user_id <> ${userId}) AS shared
          FROM momentos m
          LEFT JOIN momento_space_access msa
            ON msa.owner_user_id = m.user_id
           AND msa.member_user_id = ${userId}
           AND msa.deleted_at IS NULL
          LEFT JOIN users owner ON owner.id = m.user_id
          WHERE m.deleted_at IS NULL
            AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
            AND m.kind = ${validKind}
            AND (m.captured_at, m.id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
          ORDER BY m.captured_at DESC, m.id DESC
          LIMIT ${limit + 1}
        `),
      ),
      MomentoListRowSchema,
      'momentos.list.cursor.kind',
    )
  } else if (cursorTs && cursorId) {
    return parseRows(
      await runWithSystemRls(() =>
        sqlTyped<MomentoListRow>(sql`
          SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
                 m.created_at, m.updated_at,
                 m.user_id AS owner_user_id,
                 owner.display_name AS owner_display_name,
                 owner.email AS owner_email,
                 CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
                 (m.user_id <> ${userId}) AS shared
          FROM momentos m
          LEFT JOIN momento_space_access msa
            ON msa.owner_user_id = m.user_id
           AND msa.member_user_id = ${userId}
           AND msa.deleted_at IS NULL
          LEFT JOIN users owner ON owner.id = m.user_id
          WHERE m.deleted_at IS NULL
            AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
            AND (m.captured_at, m.id) < (${cursorTs}::timestamptz, ${cursorId}::uuid)
          ORDER BY m.captured_at DESC, m.id DESC
          LIMIT ${limit + 1}
        `),
      ),
      MomentoListRowSchema,
      'momentos.list.cursor',
    )
  } else if (validKind) {
    return parseRows(
      await runWithSystemRls(() =>
        sqlTyped<MomentoListRow>(sql`
          SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
                 m.created_at, m.updated_at,
                 m.user_id AS owner_user_id,
                 owner.display_name AS owner_display_name,
                 owner.email AS owner_email,
                 CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
                 (m.user_id <> ${userId}) AS shared
          FROM momentos m
          LEFT JOIN momento_space_access msa
            ON msa.owner_user_id = m.user_id
           AND msa.member_user_id = ${userId}
           AND msa.deleted_at IS NULL
          LEFT JOIN users owner ON owner.id = m.user_id
          WHERE m.deleted_at IS NULL
            AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
            AND m.kind = ${validKind}
          ORDER BY m.captured_at DESC, m.id DESC
          LIMIT ${limit + 1}
        `),
      ),
      MomentoListRowSchema,
      'momentos.list.kind',
    )
  } else {
    return parseRows(
      await runWithSystemRls(() =>
        sqlTyped<MomentoListRow>(sql`
          SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
                 m.created_at, m.updated_at,
                 m.user_id AS owner_user_id,
                 owner.display_name AS owner_display_name,
                 owner.email AS owner_email,
                 CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
                 (m.user_id <> ${userId}) AS shared
          FROM momentos m
          LEFT JOIN momento_space_access msa
            ON msa.owner_user_id = m.user_id
           AND msa.member_user_id = ${userId}
           AND msa.deleted_at IS NULL
          LEFT JOIN users owner ON owner.id = m.user_id
          WHERE m.deleted_at IS NULL
            AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
          ORDER BY m.captured_at DESC, m.id DESC
          LIMIT ${limit + 1}
        `),
      ),
      MomentoListRowSchema,
      'momentos.list.all',
    )
  }
}

/**
 * Bulk-fetch de links para los momentos de una página, dedupe vía el caller.
 * El JOIN a entities excluye soft-borradas (mismo criterio que el GET individual).
 */
export async function loadMomentosEntityLinks(
  sql: Sql,
  itemIds: string[],
): Promise<MomentoEntityLinkRow[]> {
  return parseRows(
    await runWithSystemRls(() =>
      sqlTyped<MomentoEntityLinkRow>(sql`
        SELECT me.momento_id, me.entity_id
        FROM momento_entities me
        JOIN momentos m ON m.id = me.momento_id
        JOIN entities e ON e.id = me.entity_id AND e.deleted_at IS NULL
        WHERE me.momento_id = ANY(${itemIds}::uuid[])
          AND me.user_id = m.user_id
          AND me.deleted_at IS NULL
      `),
    ),
    MomentoEntityLinkRowSchema,
    'momentos.list.links',
  )
}

// ------------------------------------------------------- entidades / links ----

/**
 * Ids de entidades que existen y pertenecen al dueño (query pura, sin RLS).
 * POST la corre como el usuario; PATCH la envuelve en `runWithSystemRls`.
 */
export function selectOwnedEntityIds(
  sql: Sql,
  entityIds: string[],
  ownerId: string,
): Promise<EntityIdRow[]> {
  return sqlTyped<EntityIdRow>(sql`
    SELECT id
    FROM entities
    WHERE id = ANY(${entityIds}::uuid[])
      AND deleted_at IS NULL
      AND user_id = ${ownerId}
  `)
}

/**
 * Reemplaza el set completo de vínculos de un momento: soft-deletea los
 * actuales y reinserta los nuevos (si los hay). Corre bajo RLS de sistema.
 */
export async function replaceMomentoEntityLinks(
  sql: Sql,
  momentoId: string,
  entityIds: string[],
  ownerUserId: string,
): Promise<void> {
  // Reemplazo atómico en UN solo CTE: soft-delete de los links que ya no están +
  // upsert (reactivación) de los deseados. Los dos conjuntos son DISJUNTOS por
  // `entity_id NOT IN desired`, así ninguna fila se toca dos veces (lo que
  // Postgres rechazaría) y el momento nunca queda sin links si el Lambda muere a
  // media operación. Con entityIds vacío, `desired` queda vacío y se soft-borran
  // todos. (mutación multi-tabla → CTE, docs/conventions/dominios.md; regresión
  // en scripts/check-cte-regression.sql)
  await runWithSystemRls(
    () => sql`
      WITH desired AS (
        SELECT DISTINCT e_id FROM unnest(${entityIds}::uuid[]) AS e_id
      ),
      soft_deleted AS (
        UPDATE momento_entities
        SET deleted_at = NOW()
        WHERE momento_id = ${momentoId}::uuid AND user_id = ${ownerUserId}
          AND deleted_at IS NULL
          AND entity_id NOT IN (SELECT e_id FROM desired)
        RETURNING 1
      )
      INSERT INTO momento_entities (momento_id, entity_id, user_id)
      SELECT ${momentoId}::uuid, e_id, ${ownerUserId} FROM desired
      ON CONFLICT (momento_id, entity_id) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          deleted_at = NULL
    `,
  )
}

// ----------------------------------------------------------- POST create ----

export type InsertMomentoDraft = {
  kind: MomentoKind
  capturedAt: string
  payload: Record<string, unknown>
  note: string | null
  origin: Origin
  entityIds: string[]
}

/**
 * Crea el momento + linkea sus entidades en UN solo CTE (atomicidad: el momento
 * no queda sin sus links si el Lambda muere a mitad). Las entidades ya se
 * validaron en el caller; con entity_ids vacío, `unnest` no inserta nada.
 * Convención "mutación multi-tabla → CTE" (docs/conventions/dominios.md).
 * Si tocás este CTE, actualizá scripts/check-cte-regression.sql.
 */
export async function insertMomentoWithLinks(
  sql: Sql,
  draft: InsertMomentoDraft,
  emb: Embedding,
  userId: string,
): Promise<MomentoResponseRow[]> {
  const { kind, payload, note, origin, capturedAt, entityIds } = draft
  return parseRows(
    await sqlTyped<MomentoResponseRow>(sql`
      WITH ins AS (
        INSERT INTO momentos (
          kind, captured_at, payload, note, origin,
          embedding, embedding_model, embedding_at, user_id
        ) VALUES (
          ${kind},
          ${capturedAt}::timestamptz,
          ${JSON.stringify(payload)}::jsonb,
          ${note},
          ${JSON.stringify(origin)}::jsonb,
          ${emb ? toPgVector(emb.vector) : null}::vector,
          ${emb?.model ?? null},
          ${emb ? new Date().toISOString() : null}::timestamptz,
          ${userId}
        )
        RETURNING id, kind, captured_at, payload, note, origin, created_at, updated_at
      ),
      link AS (
        INSERT INTO momento_entities (momento_id, entity_id, user_id)
        SELECT (SELECT id FROM ins), e_id, ${userId}
        FROM unnest(${entityIds}::uuid[]) AS e_id
        ON CONFLICT (momento_id, entity_id) DO UPDATE
        SET user_id = EXCLUDED.user_id, deleted_at = NULL
        RETURNING 1
      )
      SELECT id, kind, captured_at, payload, note, origin, created_at, updated_at FROM ins
    `),
    MomentoResponseRowSchema,
    'momentos.create.returning',
  )
}

// ---------------------------------------------------------- PATCH update ----

/**
 * Estado actual del momento para el PATCH: kind + payload/note vigentes + rol.
 * No permitimos cambiar kind via PATCH (requeriría re-encoding del payload).
 */
export async function loadCurrentMomento(
  sql: Sql,
  id: string,
  userId: string,
): Promise<CurrentMomentoRow[]> {
  return parseRows(
    await runWithSystemRls(() =>
      sqlTyped<CurrentMomentoRow>(sql`
        SELECT m.kind, m.payload, m.note, m.user_id,
               CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role
        FROM momentos m
        LEFT JOIN momento_space_access msa
          ON msa.owner_user_id = m.user_id
         AND msa.member_user_id = ${userId}
         AND msa.deleted_at IS NULL
        WHERE m.id = ${id}
          AND m.deleted_at IS NULL
          AND (m.user_id = ${userId} OR msa.member_user_id IS NOT NULL)
      `),
    ),
    CurrentMomentoRowSchema,
    'momentos.patch.current',
  )
}

export type UpdateMomentoContentParams = {
  id: string
  ownerUserId: string
  newPayload: Record<string, unknown>
  newNote: string | null
  newCapturedAt: string | null
  shouldUpdateContent: boolean
  shouldReembed: boolean
  emb: Embedding
}

/**
 * Persiste cambios de contenido del momento. El UPDATE solo toca embedding
 * cuando hubo cambio textual (CASE sobre shouldReembed); cambios que no alteran
 * el texto embebible se guardan sin gastar OpenAI ni pisar el embedding actual.
 */
export async function updateMomentoContent(
  sql: Sql,
  {
    id,
    ownerUserId,
    newPayload,
    newNote,
    newCapturedAt,
    shouldUpdateContent,
    shouldReembed,
    emb,
  }: UpdateMomentoContentParams,
): Promise<void> {
  await runWithSystemRls(
    () => sql`
      UPDATE momentos
      SET payload = CASE
            WHEN ${shouldUpdateContent} THEN ${JSON.stringify(newPayload)}::jsonb
            ELSE payload
          END,
          note = CASE WHEN ${shouldUpdateContent} THEN ${newNote} ELSE note END,
          captured_at = COALESCE(${newCapturedAt}::timestamptz, captured_at),
          embedding = CASE
            WHEN ${shouldReembed} THEN ${emb ? toPgVector(emb.vector) : null}::vector
            ELSE embedding
          END,
          embedding_model = CASE
            WHEN ${shouldReembed} THEN ${emb?.model ?? null}
            ELSE embedding_model
          END,
          embedding_at = CASE
            WHEN ${shouldReembed} THEN ${emb ? new Date().toISOString() : null}::timestamptz
            ELSE embedding_at
          END,
          updated_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${ownerUserId}
    `,
  )
}

/** El momento ya actualizado, con rol de acceso, para la respuesta del PATCH. */
export async function loadMomentoAfterPatch(
  sql: Sql,
  id: string,
  userId: string,
): Promise<MomentoListRow[]> {
  return parseRows(
    await runWithSystemRls(() =>
      sqlTyped<MomentoListRow>(sql`
        SELECT m.id, m.kind, m.captured_at, m.payload, m.note, m.origin,
               m.created_at, m.updated_at,
               m.user_id AS owner_user_id,
               owner.display_name AS owner_display_name,
               owner.email AS owner_email,
               CASE WHEN m.user_id = ${userId} THEN 'owner' ELSE msa.role END AS access_role,
               (m.user_id <> ${userId}) AS shared
        FROM momentos m
        LEFT JOIN momento_space_access msa
          ON msa.owner_user_id = m.user_id
         AND msa.member_user_id = ${userId}
         AND msa.deleted_at IS NULL
        LEFT JOIN users owner ON owner.id = m.user_id
        WHERE m.id = ${id}
      `),
    ),
    MomentoListRowSchema,
    'momentos.patch.returning',
  )
}

/** entityIds vigentes tras el PATCH (sin el JOIN a entities del GET). */
export async function loadMomentoEntityLinkIdsAfterPatch(
  sql: Sql,
  id: string,
  ownerUserId: string,
): Promise<MomentoLinkIdRow[]> {
  return parseRows(
    await runWithSystemRls(() =>
      sqlTyped<MomentoLinkIdRow>(sql`
        SELECT entity_id
        FROM momento_entities
        WHERE momento_id = ${id} AND user_id = ${ownerUserId} AND deleted_at IS NULL
      `),
    ),
    MomentoEntityLinkRowSchema.pick({ entity_id: true }),
    'momentos.patch.links',
  )
}

// --------------------------------------------------------------- DELETE ----

/** Soft-delete del momento; devuelve la fila borrada (o vacío si no era visible). */
export async function softDeleteMomento(
  sql: Sql,
  id: string,
  userId: string,
): Promise<DeletedMomentoRow[]> {
  return parseRows(
    await sqlTyped<DeletedMomentoRow>(sql`
      UPDATE momentos
      SET deleted_at = NOW()
      WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
      RETURNING id, deleted_at
    `),
    DeletedMomentoRowSchema,
    'momentos.delete.returning',
  )
}
