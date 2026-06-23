import { z } from 'zod'
import type { RecorteCreateBody, RecortePatchBody } from './recorte-schemas.js'
import type { EntityLite } from './recorte-suggest-prompt.js'
import type { SqlClient } from './sql-client.js'
import { sqlTyped } from './db.js'
import { parseRows } from './row-parse.js'

type RecorteCreateInput = z.infer<typeof RecorteCreateBody>
type RecortePatchInput = z.infer<typeof RecortePatchBody>

export type RecorteSuggestion = {
  relatedEntityIds: string[]
  [key: string]: unknown
}

/**
 * E6 — schema Zod fiel a la proyección canónica de 15 columnas que devuelven
 * los SELECT/RETURNING críticos de recortes (promote, unpromote, el read
 * idempotente de la promoción foto). Se usa con `parseRows(...)` para validar
 * el shape en runtime: si en el futuro alguien edita uno de esos SELECT y
 * omite una columna o cambia su tipo, el parse falla en runtime con el context
 * de la query en vez de devolver datos truncados en silencio.
 *
 * Mapeo columna→tipo verificado contra la migración 20260612000000_recortes
 * (+ capture_mode/image_key de 20260612140000): los TIMESTAMPTZ llegan como
 * string ISO por el driver HTTP de Neon; los CHECK enums se modelan con
 * z.enum; NOT NULL vs nullable replica el esquema. NO incluye `source` ni
 * `images`: esas columnas solo aparecen en `listRecortes`, no en esta
 * proyección.
 */
export const RecorteRowSchema = z.object({
  id: z.string(),
  text: z.string(),
  source_url: z.string().nullable(),
  source_title: z.string().nullable(),
  source_author: z.string().nullable(),
  note: z.string().nullable(),
  image_url: z.string().nullable(),
  image_key: z.string().nullable(),
  capture_mode: z.enum(['citation', 'article', 'html', 'region', 'image']).nullable(),
  status: z.enum(['pending', 'promoted', 'archived']),
  promoted_target: z.enum(['quote', 'entity', 'momento']).nullable(),
  promoted_id: z.string().nullable(),
  captured_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type RecorteRow = z.infer<typeof RecorteRowSchema> & {
  source?: string | null
  images?: Array<{ storage_key: string }> | null
}

/**
 * E4 — única fuente de verdad de la proyección de columnas que devuelven los
 * CTE de promoción de recortes (SELECT/RETURNING). Antes vivía repetida ~8 veces
 * inline en los tres bloques de `/promote` (quote/entity/momento), que solo se
 * diferencian en el INSERT del destino. Es texto SQL estático (identificadores
 * bajo control del servidor, nunca input de usuario), por eso se interpola con
 * `sql.unsafe(...)` —el driver lo concatena literal, no como parámetro—. El
 * orden y los nombres replican exactamente `RecorteRowSchema`.
 */
const recorteRowColumns = [
  'id',
  'text',
  'source_url',
  'source_title',
  'source_author',
  'note',
  'image_url',
  'image_key',
  'capture_mode',
  'status',
  'promoted_target',
  'promoted_id',
  'captured_at',
  'created_at',
  'updated_at',
] as const

/** `id, text, ...` — proyección sin alias (SELECT de `marked` y rama UNION). */
const recorteRowProjection = recorteRowColumns.join(', ')
/** `r.id, r.text, ...` — proyección con alias `r` (RETURNING y JOIN sobre recortes). */
const recorteRowProjectionR = recorteRowColumns.map((col) => `r.${col}`).join(', ')

/** Fragmento `inserted AS (...)` específico del target, ya con sus parámetros. */
export type PromoteInsertedCte = ReturnType<SqlClient>

/**
 * E4 — builder transaccional de `/promote`. Reúne la estructura invariante de
 * los tres CTE de promoción (`current_recorte` → `inserted` → `marked` →
 * SELECT/UNION ALL idempotente) y deja como único punto variable el fragmento
 * `inserted AS (...)` que cada destino arma con su tabla y sus valores. La
 * semántica es idéntica a los CTE inline previos: mismo orden de CTEs, mismo
 * soft-delete/idempotencia (`status <> 'promoted'` + rama UNION para el recorte
 * ya promovido) y la misma proyección devuelta. `parseRows(..., context)`
 * valida el shape en runtime (E6) por cada destino.
 */
export async function buildPromoteRecorteCte(
  sql: SqlClient,
  params: {
    id: string
    userId: string
    target: 'quote' | 'entity' | 'momento'
    inserted: PromoteInsertedCte
    context: string
  },
): Promise<RecorteRow[]> {
  const { id, userId, target, inserted, context } = params
  const unsafe = sql.unsafe
  if (!unsafe) {
    throw new Error('El cliente SQL no soporta sql.unsafe para los CTE de recortes')
  }
  const projection = unsafe(recorteRowProjection)
  const projectionR = unsafe(recorteRowProjectionR)
  return parseRows(
    await sqlTyped<RecorteRow>(sql`
      WITH current_recorte AS (
        SELECT id, status
        FROM recortes
        WHERE id = ${id} AND deleted_at IS NULL AND user_id = ${userId}
        FOR UPDATE
      ),
      inserted AS (
        ${inserted}
      ),
      marked AS (
        UPDATE recortes r
        SET status = 'promoted',
            promoted_target = ${target},
            promoted_id = (SELECT id FROM inserted),
            updated_at = NOW()
        WHERE r.id = (SELECT id FROM current_recorte)
          AND r.status <> 'promoted'
          AND EXISTS (SELECT 1 FROM inserted)
        RETURNING ${projectionR}
      )
      SELECT ${projection}
      FROM marked
      UNION ALL
      SELECT ${projectionR}
      FROM recortes r
      JOIN current_recorte cr ON cr.id = r.id
      WHERE cr.status = 'promoted'
      LIMIT 1
    `),
    RecorteRowSchema,
    context,
  )
}

function nullishToNull<T>(value: T | null | undefined): T | null {
  return value ?? null
}

export function buildRecorteCreateDraft(body: RecorteCreateInput): {
  text: string
  sourceUrl: string | null
  sourceTitle: string | null
  sourceAuthor: string | null
  note: string | null
  imageUrl: string | null
  imageKey: string | null
  captureMode: string | null
  capturedAt: string | null
} {
  return {
    text: body.text,
    sourceUrl: nullishToNull(body.sourceUrl),
    sourceTitle: nullishToNull(body.sourceTitle),
    sourceAuthor: nullishToNull(body.sourceAuthor),
    note: nullishToNull(body.note),
    imageUrl: nullishToNull(body.imageUrl),
    imageKey: nullishToNull(body.imageKey),
    captureMode: nullishToNull(body.captureMode),
    capturedAt: nullishToNull(body.capturedAt),
  }
}

export function buildRecortePatchDraft(body: RecortePatchInput): {
  text: string | null
  sourceTitle: string | null
  sourceAuthor: string | null
  imageUrl: string | null
  note: string | null
  noteProvided: boolean
  status: 'pending' | 'archived' | null
} {
  return {
    text: body.text ?? null,
    sourceTitle: body.sourceTitle ?? null,
    sourceAuthor: body.sourceAuthor ?? null,
    imageUrl: body.imageUrl ?? null,
    note: body.note ?? null,
    noteProvided: body.note !== undefined,
    status: body.status ?? null,
  }
}

export function recorteImageSourceKeys(recorte: {
  imageKey: string | null
  images?: Array<{ storage_key: string }> | null
}): string[] {
  const eventKeys = (recorte.images ?? [])
    .map((image) => image.storage_key)
    .filter((key) => key.length > 0)
  return eventKeys.length > 0 ? eventKeys : recorte.imageKey ? [recorte.imageKey] : []
}

export function buildRecorteSuggestionResponse<T extends RecorteSuggestion>(
  suggestion: T,
  entityRows: EntityLite[],
): T & { relatedEntities: EntityLite[] } {
  return {
    ...suggestion,
    relatedEntities: entityRows.filter((entity) =>
      suggestion.relatedEntityIds.includes(entity.id),
    ),
  }
}
