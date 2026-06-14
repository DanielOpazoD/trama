import { z } from 'zod'
import { QueryBody, type QueryInput } from './query/ast.js'

/**
 * Consultas guardadas (Fase 4). Persisten un AST de query con nombre por
 * usuario. El AST se valida con el MISMO `QueryBody` del motor — así una
 * consulta guardada (y un bloque embebible) nunca puede contener algo que el
 * compilador no acepte.
 *
 * Schemas y mapeo row→DTO viven acá (puros, testeables); el endpoint
 * (`saved-queries.mts`) sólo orquesta SQL bajo RLS.
 */

const Name = z.string().min(1).max(120)
const Description = z.string().max(500)

export const SavedQueryCreate = z.object({
  name: Name,
  description: Description.optional(),
  query: QueryBody,
  pinned: z.boolean().optional(),
})

/**
 * Patch parcial: `id` obligatorio; el resto opcional (sólo se tocan los campos
 * presentes, vía COALESCE en SQL). Para vaciar la descripción, mandar "".
 */
export const SavedQueryPatch = z.object({
  id: z.string().uuid(),
  name: Name.optional(),
  description: Description.optional(),
  query: QueryBody.optional(),
  pinned: z.boolean().optional(),
})

export const SavedQueryDelete = z.object({ id: z.string().uuid() })

export type SavedQueryRow = {
  id: string
  name: string
  description: string | null
  query: unknown
  pinned: boolean
  created_at: string
  updated_at: string
}

export type SavedQueryDTO = {
  id: string
  name: string
  description: string | null
  query: QueryInput
  pinned: boolean
  createdAt: string
  updatedAt: string
}

/** Normaliza la fila SQL (snake_case) al DTO que consume el front (camelCase). */
export function toSavedQueryDTO(row: SavedQueryRow): SavedQueryDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    query: row.query as QueryInput,
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
