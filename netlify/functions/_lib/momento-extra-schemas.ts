import { z } from 'zod'

/**
 * Schemas Zod para los endpoints "extras" de momentos:
 *   - POST /api/momentos-merge          → MomentosMergeBody
 *   - POST /api/momentos-restore        → MomentoRestoreBody
 *   - POST /api/momentos-orphaned-blobs → OrphanedBlobRescueBody
 *
 * (Los CRUD principales viven en momento-schemas.ts.)
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Body para fusionar N momentos foto en uno solo. Validamos UUIDs
 * acá para devolver 400 claro en vez de un 500 cuando Postgres rechaza
 * el cast a ::uuid.
 */
export const MomentosMergeBody = z.object({
  primaryId: z.string().regex(UUID_RE, 'primaryId no es un UUID válido'),
  otherIds: z
    .array(z.string().regex(UUID_RE, 'otherIds contiene un UUID inválido'))
    .min(1, 'otherIds debe tener al menos 1 elemento'),
  note: z.string().nullable().optional(),
  capturedAt: z.string().optional(),
})
export type MomentosMergeBodyT = z.infer<typeof MomentosMergeBody>

export const MomentoRestoreBody = z.object({
  id: z.string().min(1, 'id requerido'),
  deletedAt: z.string().min(1, 'deletedAt requerido'),
})
export type MomentoRestoreBodyT = z.infer<typeof MomentoRestoreBody>

/**
 * Body para adoptar un blob huérfano. El servidor verifica después que
 * el blob exista en el store y no esté ya referenciado.
 */
export const OrphanedBlobRescueBody = z.object({
  storageKey: z.string().min(1, 'storageKey requerido'),
  note: z.string().optional(),
  capturedAt: z.string().optional(),
})
export type OrphanedBlobRescueBodyT = z.infer<typeof OrphanedBlobRescueBody>

/**
 * PATCH /api/proactive-suggestions/:id — actualizar status. Solo
 * permitimos los dos values terminales; el handler ya lo valida pero
 * Zod lo deja explícito.
 */
export const ProactiveStatusPatchBody = z.object({
  status: z.enum(['applied', 'dismissed']),
})
export type ProactiveStatusPatchBodyT = z.infer<typeof ProactiveStatusPatchBody>
