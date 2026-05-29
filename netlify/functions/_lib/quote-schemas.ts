import { z } from 'zod'

/**
 * Schemas Zod para los bodies de POST / PATCH / restore de `quotes.mts`.
 *
 * Notas:
 *   - `entity_id` requerido en POST (toda cita debe atribuirse a una
 *     entidad). En PATCH es opcional — permite reasignar a otra entidad.
 *   - `text` requerido en POST con min(1); en PATCH opcional con min(1)
 *     (no aceptamos pasar "" para borrar el texto de una cita existente).
 *   - `linked_quote_ids` array de UUIDs — validamos como string[] simple
 *     y dejamos que Postgres rechace si no son UUIDs reales (el server
 *     ya hace `${linked}::uuid[]`).
 */

export const QuoteCreateBody = z.object({
  entity_id: z.string().min(1, 'entity_id requerido'),
  text: z.string().min(1, 'text requerido'),
  source: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  link: z.string().max(2000).nullable().optional(),
  user_reflection: z.string().nullable().optional(),
  linked_quote_ids: z.array(z.string()).nullable().optional(),
  origin: z.unknown().optional(),
})
export type QuoteCreateBodyT = z.infer<typeof QuoteCreateBody>

export const QuotePatchBody = z.object({
  text: z.string().min(1).optional(),
  source: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  link: z.string().max(2000).nullable().optional(),
  entity_id: z.string().min(1).optional(),
  user_reflection: z.string().nullable().optional(),
  ai_reflection: z.string().nullable().optional(),
  ai_reflection_provider: z.string().nullable().optional(),
  ai_reflection_model: z.string().nullable().optional(),
  linked_quote_ids: z.array(z.string()).nullable().optional(),
  pinned: z.boolean().optional(),
  // U-1: Resonancia. 1-5 = el usuario marcó. null = el usuario destildó
  // (volver a sin marcar). undefined (omitido) = no tocar.
  resonance: z.number().int().min(1).max(5).nullable().optional(),
})
export type QuotePatchBodyT = z.infer<typeof QuotePatchBody>

export const QuoteRestoreBody = z.object({
  deletedAt: z.string().min(1, 'deletedAt requerido'),
})
export type QuoteRestoreBodyT = z.infer<typeof QuoteRestoreBody>
