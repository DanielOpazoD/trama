/**
 * Adapter servidor para schemas de Momentos.
 *
 * La validación por kind vive en `src/schemas/momento.ts` y se re-exporta
 * desde acá para mantener estables los imports existentes de Functions.
 * Este archivo conserva únicamente los body schemas propios del endpoint
 * POST/PATCH, que sí son frontera servidor.
 */

import { z } from 'zod'
import { MomentoKindSchema } from '../../../src/schemas/momento.js'

export {
  MomentoFotoPayloadSchema,
  MomentoKindSchema,
  MomentoNotaPayloadSchema,
  MomentoRecortePayloadSchema,
  validateMomentoPayload,
} from '../../../src/schemas/momento.js'
export type { MomentoKind } from '../../../src/schemas/momento.js'

// ---------- body schemas para POST / PATCH ----------

/**
 * Body completo de POST /api/momentos.
 * El `payload` se valida con shape genérica (object) acá, y la
 * verificación kind-específica corre por `validateMomentoPayload` dentro
 * del handler. Razón: Zod no maneja bien discriminated union de objetos
 * complejos cuando el payload puede no traer la shape esperada (queremos
 * mensaje claro "kind=nota requiere bodyText" no "tag missing").
 */
export const MomentoCreateBody = z.object({
  kind: MomentoKindSchema,
  payload: z.record(z.string(), z.unknown()),
  note: z.string().nullable().optional(),
  origin: z.unknown().optional(),
  captured_at: z.string().optional(),
  entity_ids: z.array(z.string()).optional(),
})
export type MomentoCreateBodyT = z.infer<typeof MomentoCreateBody>

/**
 * Body de PATCH /api/momentos/:id. Todos los campos opcionales — el
 * handler decide qué actualiza. `kind` no se permite cambiar via PATCH
 * (re-encoding del payload requeriría re-embed costoso). El handler
 * lo verifica leyendo el kind actual de la DB.
 */
export const MomentoPatchBody = z.object({
  payload: z.record(z.string(), z.unknown()).optional(),
  note: z.string().nullable().optional(),
  captured_at: z.string().optional(),
  entity_ids: z.array(z.string()).optional(),
})
export type MomentoPatchBodyT = z.infer<typeof MomentoPatchBody>
