import { entityEmbeddingText } from './embeddings.js'
import type { EntityCreateBodyT, EntityPatchBodyT } from './entity-schemas.js'
import { normalizeOrigin, type Origin } from './origin.js'

/**
 * E3 — lógica PURA de dominio del handler de entidades.
 *
 * Acá viven SOLO las decisiones que no tocan DB/Request/Response: normalización
 * del body de create, la decisión de re-embed en PATCH, el texto fuente del
 * embedding, el parseo del cursor de paginación y el shape de las sugerencias de
 * duplicado. El handler (`entities-endpoint.ts`) sigue dueño de auth, getSql,
 * RLS, los CTE atómicos de soft-delete/restore y `Response`.
 *
 * Validado por `npm run check:backend-domain-services`: este archivo NO debe
 * importar `db`/`getSql`/`Request`/`Response` ni ejecutar SQL.
 */

/** Campos que alimentan el embedding de una entidad (nombre, tipo, año, descr). */
export type EntityEmbeddingFields = {
  name: string
  type: string
  year: number | null
  description: string | null
}

/**
 * Texto canónico que se embebe para una entidad. Wrapper fino sobre
 * `entityEmbeddingText` (que ya es puro) para que create y el re-embed de PATCH
 * compartan exactamente la misma fuente y no diverjan.
 */
export function buildEntityEmbeddingSource(fields: EntityEmbeddingFields): string {
  return entityEmbeddingText({
    name: fields.name,
    type: fields.type,
    year: fields.year,
    description: fields.description,
  })
}

/** Valores normalizados listos para el INSERT de una entidad nueva. */
export type EntityCreateDraft = {
  type: string
  name: string
  year: number | null
  description: string | null
  essay: string | null
  positionX: number | null
  positionY: number | null
  origin: Origin
  spotifyUrl: string | null
  wikipediaUrl: string | null
  grokipediaUrl: string | null
  embedSource: string
}

/**
 * Construye el draft de create desde el body ya parseado por Zod: aplica
 * `normalizeOrigin` (acepta objeto, string legacy o ausente) y colapsa los
 * `undefined`/ausentes a `null` para el INSERT. `embedSource` es el texto a
 * embeber antes de insertar. NO toca la DB.
 */
export function buildEntityCreateDraft(body: EntityCreateBodyT): EntityCreateDraft {
  const year = body.year ?? null
  const description = body.description ?? null
  return {
    type: body.type,
    name: body.name,
    year,
    description,
    essay: body.essay ?? null,
    positionX: body.position_x ?? null,
    positionY: body.position_y ?? null,
    origin: normalizeOrigin(body.origin),
    spotifyUrl: body.spotify_url ?? null,
    wikipediaUrl: body.wikipedia_url ?? null,
    grokipediaUrl: body.grokipedia_url ?? null,
    embedSource: buildEntityEmbeddingSource({
      name: body.name,
      type: body.type,
      year,
      description,
    }),
  }
}

/**
 * ¿El PATCH tocó algún campo que alimenta el embedding? Es la condición
 * necesaria (no suficiente) para re-embedear: si esto es false ni siquiera hace
 * falta leer la fila actual de la DB.
 */
export function patchTouchesEmbeddingInput(patch: EntityPatchBodyT): boolean {
  return (
    patch.name !== undefined ||
    patch.type !== undefined ||
    patch.year !== undefined ||
    patch.description !== undefined
  )
}

/**
 * Decisión PURA de re-embed en PATCH: dado el body del PATCH y la fila actual,
 * ¿cambió de verdad alguno de los campos que alimentan el embedding? Solo
 * cuenta como cambio si el campo vino en el patch Y su valor difiere del actual
 * (los `year`/`description` ausentes se comparan como `null`). Replica la
 * semántica previa inline del handler — no re-embebe si el texto no cambió,
 * evitando costo OpenAI inútil (regla de AGENTS.md).
 */
export function shouldReembedEntity(params: {
  patch: EntityPatchBodyT
  current: EntityEmbeddingFields | undefined
}): boolean {
  const { patch, current } = params
  if (!current) return false
  if (!patchTouchesEmbeddingInput(patch)) return false
  return Boolean(
    (patch.name !== undefined && patch.name !== current.name) ||
    (patch.type !== undefined && patch.type !== current.type) ||
    (patch.year !== undefined && (patch.year ?? null) !== current.year) ||
    (patch.description !== undefined &&
      (patch.description ?? null) !== current.description),
  )
}

/** Cursor de paginación parseado: `"<created_at_iso>:<uuid>"`. */
export type EntityCursor = { ts: string; id: string } | null

/**
 * Parsea el cursor `"<created_at_iso>:<uuid>"` que devolvimos como `nextCursor`.
 * Cortamos en el ÚLTIMO `:` porque el timestamp ISO contiene `:` (la hora).
 * Devuelve null si el cursor es vacío o malformado (el handler cae a la primera
 * página). PURO — solo parsea el string.
 */
export function parseEntityCursor(cursorParam: string | null): EntityCursor {
  if (!cursorParam) return null
  const sep = cursorParam.lastIndexOf(':')
  if (sep <= 0) return null
  return { ts: cursorParam.slice(0, sep), id: cursorParam.slice(sep + 1) }
}

/**
 * Clampa el `?limit` de paginación al rango [1, 200] con default 50 cuando no es
 * un entero válido. PURO.
 */
export function clampEntityLimit(limitParam: string | null): number {
  const parsed = Number.parseInt(limitParam ?? '', 10)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 50
}

/** Fila cruda del SELECT de dup-detection (snake_case + distancia coseno). */
export type DuplicateRow = {
  id: string
  name: string
  type: string
  description: string | null
  distance: number | string
}

/** Sugerencia de duplicado en el shape público que consume el panel de la UI. */
export type DuplicateSuggestion = {
  id: string
  name: string
  type: string
  description: string | null
  similarity: number
}

/**
 * Mapea las filas del SELECT de dup-detection al shape público de sugerencias.
 * Convierte la distancia coseno (pgvector `<=>`, rango [0,2]) en una similitud
 * en [0,1] vía `1 - distance/2`, clampeada por seguridad. PURO — la query y el
 * 409 los maneja el handler.
 */
export function buildDuplicateSuggestions(rows: DuplicateRow[]): DuplicateSuggestion[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    similarity: Math.max(0, Math.min(1, 1 - Number(row.distance) / 2)),
  }))
}
