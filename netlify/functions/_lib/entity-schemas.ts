import { z } from 'zod'

/**
 * Schemas Zod para los bodies de POST / PATCH de `entities.mts`.
 *
 * Notas:
 *   - `type` es string libre (no enum) porque la fuente de verdad son
 *     las tablas `entity_types` / `relationship_types` (CLAUDE.md).
 *     Validar contra una lista cerrada acá rompería la extensibilidad.
 *   - `origin` queda como `unknown` para que el handler aplique su
 *     normalizeOrigin (acepta varias shapes legacy).
 *   - `position_x` / `position_y` se aceptan como number, null, o ausente
 *     (algunos clientes los mandan, otros no).
 *   - `name` requiere min(1) — un string vacío sería un nombre roto y
 *     causaría errores raros aguas abajo.
 */

export const EntityCreateBody = z.object({
  type: z.string().min(1, 'type requerido'),
  name: z.string().min(1, 'name requerido'),
  year: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  essay: z.string().nullable().optional(),
  position_x: z.number().nullable().optional(),
  position_y: z.number().nullable().optional(),
  origin: z.unknown().optional(),
  spotify_url: z.string().nullable().optional(),
})
export type EntityCreateBodyT = z.infer<typeof EntityCreateBody>

/**
 * PATCH es todo opcional — el handler usa COALESCE en SQL para no pisar
 * campos no incluidos. Si llega `{ name: 'X' }` solo se actualiza name.
 */
export const EntityPatchBody = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  year: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  essay: z.string().nullable().optional(),
  position_x: z.number().nullable().optional(),
  position_y: z.number().nullable().optional(),
  spotify_url: z.string().nullable().optional(),
})
export type EntityPatchBodyT = z.infer<typeof EntityPatchBody>

/** Body del POST /api/entities/:id/restore. Necesita el deletedAt como
 *  verificación optimistic — si fue restaurado/re-borrado mientras tanto,
 *  el server responde 409. */
export const EntityRestoreBody = z.object({
  deletedAt: z.string().min(1, 'deletedAt requerido'),
})
export type EntityRestoreBodyT = z.infer<typeof EntityRestoreBody>
