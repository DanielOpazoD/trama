import { z } from 'zod'

/**
 * Schemas Zod para los bodies de POST / PATCH / restore de
 * `relationships.mts`. Similar a entity/quote schemas — type es string
 * libre (no enum) porque la fuente de verdad es la tabla
 * `relationship_types`.
 */

export const RelationshipCreateBody = z.object({
  from_id: z.string().min(1, 'from_id requerido'),
  to_id: z.string().min(1, 'to_id requerido'),
  type: z.string().min(1, 'type requerido'),
  notes: z.string().nullable().optional(),
  origin: z.unknown().optional(),
})
export type RelationshipCreateBodyT = z.infer<typeof RelationshipCreateBody>

export const RelationshipPatchBody = z.object({
  type: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
})
export type RelationshipPatchBodyT = z.infer<typeof RelationshipPatchBody>

export const RelationshipRestoreBody = z.object({
  deletedAt: z.string().min(1, 'deletedAt requerido'),
})
export type RelationshipRestoreBodyT = z.infer<typeof RelationshipRestoreBody>
