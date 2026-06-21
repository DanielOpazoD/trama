/**
 * Read-model de la Biblioteca.
 *
 * La Biblioteca no tiene tabla propia de items (sería una segunda fuente de
 * verdad que se desincroniza de los blobs reales). En su lugar UNE las fuentes
 * que ya tienen los datos y las decora con `library_item_overrides`:
 *
 *   notas_attachments · recorte_images(+recortes) · momentos(foto) ·
 *   pdf_studio_saved_pdfs · pdf_stamp_assets
 *
 * Este módulo sigue el ethos de `momentos-list.ts`: un schema Zod para los query
 * params y funciones PURAS (parseo, orden, paginación) testeables sin DB, más la
 * única función que toca Postgres (`fetchLibraryRows`).
 *
 * Convenciones del repo: snake_case en SQL, RLS por user_id (igual lo pasamos
 * explícito como `user_id = ${userId}`), soft-delete (`deleted_at IS NULL`),
 * `ApiErrors` en el endpoint. En PR1 NO se construyen URLs de servir/miniatura:
 * se acarrea storage_key + storage_domain para PR3.
 */

import { QueryParam } from './request-contracts.js'
import { sqlTyped, type SqlClient } from './db.js'
import { z } from 'zod'
import type {
  LibraryFileType,
  LibraryItemKind,
  LibrarySource,
  LibraryStorageDomain,
} from '../../../src/types/biblioteca.js'

/** Familias de archivo válidas para el filtro `tipo`. */
const FILE_TYPES: readonly LibraryFileType[] = [
  'image',
  'document',
  'spreadsheet',
  'presentation',
  'pdf',
  'audio',
  'video',
  'other',
]

/** Fuentes válidas para el filtro `fuente`. */
const SOURCES: readonly LibrarySource[] = ['subido', 'generado', 'capturado', 'whatsapp']

const ORDENES = [
  'modificado-desc',
  'modificado-asc',
  'nombre-asc',
  'nombre-desc',
  'tamano-desc',
  'tamano-asc',
] as const

export type LibraryOrden = (typeof ORDENES)[number]

/**
 * Fila cruda que devuelve `fetchLibraryRows` (post-filtros SQL, pre-orden/página
 * en TS). snake_case porque es la frontera con Postgres; el endpoint la reenvía
 * tal cual y el cliente la mapea (igual que notas-attachments).
 */
export type LibraryItemRow = {
  item_kind: LibraryItemKind
  item_id: string
  title: string
  mime_type: string | null
  byte_size: number | null
  file_type: LibraryFileType
  source: LibrarySource
  storage_key: string | null
  storage_domain: LibraryStorageDomain
  tags: string[]
  pinned: boolean
  ai_status: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Query schema (espeja momentos-list.ts: preprocessors de QueryParam + defaults)
// ---------------------------------------------------------------------------

function normalizeEnum<T extends string>(
  allowed: readonly T[],
): (value: unknown) => T | '' {
  return (value) => {
    const raw = typeof value === 'string' ? value.trim() : ''
    return (allowed as readonly string[]).includes(raw) ? (raw as T) : ''
  }
}

export const BibliotecaListQuery = z.object({
  q: z.preprocess(QueryParam.trimmedString({ max: 200 }).normalize, z.string().max(200)),
  tab: z.preprocess(
    (value) => {
      const raw = typeof value === 'string' ? value.trim() : ''
      return raw === 'imagenes' || raw === 'archivos' ? raw : 'todo'
    },
    z.enum(['todo', 'imagenes', 'archivos']),
  ),
  // tipo / fuente: '' significa "sin filtro". Un valor desconocido degrada a ''
  // (no rompe el listado, igual que kind en momentos-list).
  tipo: z.preprocess(normalizeEnum(FILE_TYPES), z.string()),
  fuente: z.preprocess(normalizeEnum(SOURCES), z.string()),
  orden: z.preprocess((value) => {
    const raw = typeof value === 'string' ? value.trim() : ''
    return (ORDENES as readonly string[]).includes(raw) ? raw : 'modificado-desc'
  }, z.enum(ORDENES)),
  incluyeEliminados: z.preprocess(
    QueryParam.boolean({ defaultValue: false }).normalize,
    z.boolean(),
  ),
  limit: z.preprocess(
    QueryParam.clampedInteger({ defaultValue: 30, min: 1, max: 100 }).normalize,
    z.number().int().min(1).max(100),
  ),
  cursor: z.preprocess(
    QueryParam.trimmedString({ max: 200 }).normalize,
    z.string().max(200),
  ),
})

export type BibliotecaListQueryT = z.infer<typeof BibliotecaListQuery>

export type LibraryFetchParams = {
  q: string
  tab: 'todo' | 'imagenes' | 'archivos'
  tipo: string
  fuente: string
  incluyeEliminados: boolean
}

export type LibraryPageParams = {
  orden: LibraryOrden
  limit: number
  offset: number
}

/**
 * Decodifica el cursor (offset numérico codificado como string). Cualquier valor
 * inválido o negativo cae a 0 — el cursor es opaco para el cliente.
 */
export function parseCursorOffset(cursor: string): number {
  if (!cursor) return 0
  const parsed = Number.parseInt(cursor, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

/** Separa el query parseado en los params de filtro (SQL) y de paginación (TS). */
export function buildLibraryListParams(query: BibliotecaListQueryT): {
  fetch: LibraryFetchParams
  page: LibraryPageParams
} {
  return {
    fetch: {
      q: query.q,
      tab: query.tab,
      tipo: query.tipo,
      fuente: query.fuente,
      incluyeEliminados: query.incluyeEliminados,
    },
    page: {
      orden: query.orden,
      limit: query.limit,
      offset: parseCursorOffset(query.cursor),
    },
  }
}

// ---------------------------------------------------------------------------
// Orden + paginación (puro, unit-testeado sin DB)
// ---------------------------------------------------------------------------

function compareTitle(a: LibraryItemRow, b: LibraryItemRow): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'accent' })
}

/**
 * Compara byteSize para una dirección dada (`dir` = 1 asc, -1 desc) dejando
 * SIEMPRE los nulls al final. Por eso la dirección se aplica solo al tramo
 * numérico: si la negáramos por fuera, los nulls saltarían al principio en desc.
 */
function compareByteSizeDirected(
  a: LibraryItemRow,
  b: LibraryItemRow,
  dir: 1 | -1,
): number {
  const av = a.byte_size
  const bv = b.byte_size
  if (av === null && bv === null) return 0
  if (av === null) return 1
  if (bv === null) return -1
  return dir * (av - bv)
}

function compareUpdatedAt(a: LibraryItemRow, b: LibraryItemRow): number {
  return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
}

/**
 * Ordena las filas según `orden` y devuelve una página + `nextCursor`.
 *
 * - `nombre` compara título sin distinguir mayúsculas/acentos.
 * - `tamano` ordena por byteSize con nulls al final (en ambas direcciones).
 * - Desempate estable por item_id, así dos llamadas devuelven el mismo orden.
 * - El cursor es un offset numérico: `nextCursor = offset+limit < total ? ... : null`.
 */
export function sortAndPaginate(
  rows: readonly LibraryItemRow[],
  { orden, limit, offset }: LibraryPageParams,
): { items: LibraryItemRow[]; nextCursor: string | null } {
  const sorted = [...rows].sort((a, b) => {
    let primary = 0
    switch (orden) {
      case 'modificado-desc':
        primary = -compareUpdatedAt(a, b)
        break
      case 'modificado-asc':
        primary = compareUpdatedAt(a, b)
        break
      case 'nombre-asc':
        primary = compareTitle(a, b)
        break
      case 'nombre-desc':
        primary = -compareTitle(a, b)
        break
      case 'tamano-desc':
        primary = compareByteSizeDirected(a, b, -1)
        break
      case 'tamano-asc':
        primary = compareByteSizeDirected(a, b, 1)
        break
    }
    if (primary !== 0) return primary
    // Desempate estable (item_id es único dentro de un kind; el kind ya entra en
    // el orden natural de las ramas del UNION, basta item_id para estabilidad).
    return a.item_id.localeCompare(b.item_id)
  })

  const total = sorted.length
  const start = Math.min(offset, total)
  const items = sorted.slice(start, start + limit)
  const nextCursor = start + limit < total ? String(start + limit) : null
  return { items, nextCursor }
}

// ---------------------------------------------------------------------------
// Fetch (única función que toca Postgres)
// ---------------------------------------------------------------------------

/**
 * Trae las filas de la Biblioteca para `userId`, aplicando filtros en SQL.
 *
 * Forma de la query (ver plan §3): un UNION ALL de 6 ramas que proyectan la
 * MISMA lista de columnas/tipos, decoradas con `library_item_overrides` vía LEFT
 * JOIN, y un SELECT final con filtros centinela (se pasan como bind params, así
 * '' = "sin filtro" sin ramificar el SQL). Cada rama filtra su propio
 * `deleted_at IS NULL` y `user_id = ${userId}`.
 *
 * El orden y la paginación se hacen en TS (`sortAndPaginate`) sobre el set
 * filtrado COMPLETO; acá solo ponemos un ORDER BY estable como base. No hay
 * LIMIT en SQL a propósito: ordenar por nombre/tamaño y paginar correctamente
 * exige el set completo (un tope truncaría páginas y falsearía el orden). A
 * escala personal es barato; el keyset en SQL es la optimización v2.
 *
 * Nota de simplificación (PR1): `momento-foto` lista UN item por momento (la
 * portada = primera storageKey encontrada en el payload). El desanidado completo
 * de `payload.items[]`/`photos[]` para listar cada foto es un follow-up v2.
 */
export async function fetchLibraryRows(
  sql: SqlClient,
  userId: string,
  params: LibraryFetchParams,
): Promise<LibraryItemRow[]> {
  const { q, tab, tipo, fuente, incluyeEliminados } = params

  return sqlTyped<LibraryItemRow>(sql`
    WITH base AS (
      -- 1) Adjuntos de notas
      SELECT
        'notas-attachment'::text AS item_kind,
        na.id::text AS item_id,
        na.user_id AS user_id,
        na.file_name AS title_native,
        na.mime_type AS mime_type,
        na.byte_size::bigint AS byte_size,
        CASE
          WHEN na.mime_type LIKE 'image/%' THEN 'image'
          WHEN na.mime_type = 'application/pdf' THEN 'pdf'
          WHEN na.mime_type LIKE 'audio/%' THEN 'audio'
          WHEN na.mime_type LIKE 'video/%' THEN 'video'
          WHEN na.mime_type IN ('application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv') THEN 'spreadsheet'
          WHEN na.mime_type IN ('application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation') THEN 'presentation'
          WHEN na.mime_type = 'application/msword'
            OR na.mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            OR na.mime_type = 'application/json'
            OR na.mime_type LIKE 'text/%' THEN 'document'
          ELSE 'other'
        END AS file_type,
        CASE WHEN na.origin->>'kind' = 'ai' THEN 'generado' ELSE 'subido' END AS source,
        na.storage_key AS storage_key,
        'notas-attachments'::text AS storage_domain,
        na.created_at AS created_at,
        na.updated_at AS updated_at
      FROM notas_attachments na
      WHERE na.deleted_at IS NULL
        AND na.user_id = ${userId}

      UNION ALL

      -- 2) Imágenes de recortes (multi): visibles solo si su recorte vive
      SELECT
        'recorte-image'::text AS item_kind,
        ri.id::text AS item_id,
        ri.user_id AS user_id,
        COALESCE(NULLIF(r.source_title, ''), 'Recorte') AS title_native,
        ri.mime AS mime_type,
        NULL::bigint AS byte_size,
        'image'::text AS file_type,
        CASE WHEN r.source = 'whatsapp' THEN 'whatsapp' ELSE 'capturado' END AS source,
        ri.storage_key AS storage_key,
        'recortes-media'::text AS storage_domain,
        ri.created_at AS created_at,
        r.updated_at AS updated_at
      FROM recorte_images ri
      JOIN recortes r ON r.id = ri.recorte_id AND r.deleted_at IS NULL
      WHERE ri.user_id = ${userId}

      UNION ALL

      -- 3) Imágenes de recortes (legacy single): recortes con image_key y sin
      --    filas en recorte_images (no migrados al modelo multi-imagen).
      SELECT
        'recorte-image'::text AS item_kind,
        r.id::text AS item_id,
        r.user_id AS user_id,
        COALESCE(NULLIF(r.source_title, ''), 'Recorte') AS title_native,
        NULL::text AS mime_type,
        NULL::bigint AS byte_size,
        'image'::text AS file_type,
        CASE WHEN r.source = 'whatsapp' THEN 'whatsapp' ELSE 'capturado' END AS source,
        r.image_key AS storage_key,
        'recortes-media'::text AS storage_domain,
        r.created_at AS created_at,
        r.updated_at AS updated_at
      FROM recortes r
      WHERE r.deleted_at IS NULL
        AND r.user_id = ${userId}
        AND r.image_key IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM recorte_images ri2 WHERE ri2.recorte_id = r.id
        )

      UNION ALL

      -- 4) Fotos de momentos: UNA por momento (la portada). El desanidado de
      --    todas las fotos de un momento (items[]/photos[]) queda para v2.
      SELECT
        'momento-foto'::text AS item_kind,
        m.id::text AS item_id,
        m.user_id AS user_id,
        COALESCE(NULLIF(m.payload->>'caption', ''), 'Foto') AS title_native,
        NULL::text AS mime_type,
        NULL::bigint AS byte_size,
        'image'::text AS file_type,
        CASE WHEN m.origin->>'kind' = 'ai' THEN 'generado' ELSE 'capturado' END AS source,
        COALESCE(
          m.payload->>'storageKey',
          m.payload->>'primaryStorageKey',
          m.payload->'items'->0->>'storageKey',
          m.payload->'photos'->0->>'storageKey'
        ) AS storage_key,
        'momentos-media'::text AS storage_domain,
        m.created_at AS created_at,
        m.updated_at AS updated_at
      FROM momentos m
      WHERE m.deleted_at IS NULL
        AND m.kind = 'foto'
        AND m.user_id = ${userId}
        AND COALESCE(
          m.payload->>'storageKey',
          m.payload->>'primaryStorageKey',
          m.payload->'items'->0->>'storageKey',
          m.payload->'photos'->0->>'storageKey'
        ) IS NOT NULL

      UNION ALL

      -- 5) PDFs guardados de PDF Studio
      SELECT
        'pdf-saved'::text AS item_kind,
        sp.id::text AS item_id,
        sp.user_id AS user_id,
        sp.name AS title_native,
        sp.mime_type AS mime_type,
        sp.byte_size::bigint AS byte_size,
        CASE
          WHEN sp.mime_type LIKE 'image/%' THEN 'image'
          WHEN sp.mime_type = 'application/pdf' THEN 'pdf'
          WHEN sp.mime_type LIKE 'audio/%' THEN 'audio'
          WHEN sp.mime_type LIKE 'video/%' THEN 'video'
          WHEN sp.mime_type IN ('application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv') THEN 'spreadsheet'
          WHEN sp.mime_type IN ('application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation') THEN 'presentation'
          WHEN sp.mime_type = 'application/msword'
            OR sp.mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            OR sp.mime_type = 'application/json'
            OR sp.mime_type LIKE 'text/%' THEN 'document'
          ELSE 'other'
        END AS file_type,
        'generado'::text AS source,
        sp.storage_key AS storage_key,
        'pdf-studio-saved-pdfs'::text AS storage_domain,
        sp.created_at AS created_at,
        sp.updated_at AS updated_at
      FROM pdf_studio_saved_pdfs sp
      WHERE sp.deleted_at IS NULL
        AND sp.user_id = ${userId}

      UNION ALL

      -- 6) Firmas / sellos de PDF Studio (blob es data URL en DB, sin endpoint
      --    de servir → storage_key NULL).
      SELECT
        'pdf-stamp'::text AS item_kind,
        ps.id AS item_id,
        ps.user_id AS user_id,
        ps.name AS title_native,
        ps.mime_type AS mime_type,
        ps.byte_size::bigint AS byte_size,
        'image'::text AS file_type,
        'generado'::text AS source,
        NULL::text AS storage_key,
        'pdf-stamp-assets'::text AS storage_domain,
        ps.created_at AS created_at,
        ps.updated_at AS updated_at
      FROM pdf_stamp_assets ps
      WHERE ps.deleted_at IS NULL
        AND ps.user_id = ${userId}
    ),
    joined AS (
      SELECT
        base.item_kind,
        base.item_id,
        base.user_id,
        COALESCE(o.display_title, base.title_native) AS title,
        base.mime_type,
        base.byte_size,
        base.file_type,
        base.source,
        base.storage_key,
        base.storage_domain,
        base.created_at,
        base.updated_at,
        o.tags AS tags,
        o.pinned AS pinned,
        o.ai_status AS ai_status,
        o.deleted_at AS lib_deleted_at
      FROM base
      LEFT JOIN library_item_overrides o
        ON o.user_id = base.user_id
        AND o.item_kind = base.item_kind
        AND o.item_id = base.item_id
    )
    SELECT
      item_kind,
      item_id,
      title,
      mime_type,
      byte_size,
      file_type,
      source,
      storage_key,
      storage_domain,
      created_at,
      updated_at,
      COALESCE(tags, '{}') AS tags,
      COALESCE(pinned, false) AS pinned,
      ai_status
    FROM joined
    WHERE (
        (${incluyeEliminados}::boolean AND lib_deleted_at IS NOT NULL)
        OR (NOT ${incluyeEliminados}::boolean AND lib_deleted_at IS NULL)
      )
      AND (
        ${tab} = 'todo'
        OR (${tab} = 'imagenes' AND file_type = 'image')
        OR (${tab} = 'archivos' AND file_type <> 'image')
      )
      AND (${tipo} = '' OR file_type = ${tipo})
      AND (${fuente} = '' OR source = ${fuente})
      AND (${q} = '' OR title ILIKE '%' || ${q} || '%')
    ORDER BY updated_at DESC
  `)
}
