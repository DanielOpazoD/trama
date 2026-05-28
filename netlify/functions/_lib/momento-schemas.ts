/**
 * Schemas Zod para validación de Momentos en el servidor.
 * Misma lógica que src/schemas/momento.ts (cliente). Mantenemos
 * copias separadas porque server y client tienen contextos distintos;
 * si cambia la forma del payload, actualizar ambas.
 */

import { z } from 'zod'

// ---------- kind ----------

export const MomentoKindSchema = z.enum(['nota', 'recorte', 'foto'])
export type MomentoKind = z.infer<typeof MomentoKindSchema>

// ---------- payloads por kind ----------

/** Nota: texto libre obligatorio. */
export const MomentoNotaPayloadSchema = z.object({
  // Mismo mensaje para "no es string" y "es string vacía" — el cliente
  // solo sabe que falta bodyText, no le interesa el tipo exacto.
  bodyText: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z
      .string({ message: 'kind=nota requiere payload.bodyText no vacío' })
      .min(1, 'kind=nota requiere payload.bodyText no vacío'),
  ),
})

/** Recorte: al menos uno de url/title/bodyText, los demás opcionales. */
export const MomentoRecortePayloadSchema = z
  .object({
    url: z.string().trim().optional(),
    title: z.string().trim().optional(),
    bodyText: z.string().trim().optional(),
    source: z.string().optional(),
    author: z.string().optional(),
    screenshotKey: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.url && data.url.length > 0) ||
      (data.title && data.title.length > 0) ||
      (data.bodyText && data.bodyText.length > 0),
    { message: 'kind=recorte requiere al menos url, title o bodyText' },
  )

const FotoItemSchema = z.object({
  storageKey: z.string().trim().min(1),
  width: z.number().optional(),
  height: z.number().optional(),
})

/** Foto: array `items[]` (nuevo, υ-multi) o `storageKey` legacy.
 *  Si vienen los dos, prefiere items en la lectura; acá ambos son válidos. */
export const MomentoFotoPayloadSchema = z
  .object({
    items: z.array(FotoItemSchema).min(1).optional(),
    // Aceptamos unknown y luego forzamos la presencia en el refine, en vez
    // de `z.string().optional()` — para que un storageKey:42 caiga al
    // mensaje "requiere storageKey o items" en vez de un type-error genérico
    // que el cliente no sabe interpretar.
    storageKey: z.unknown().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    caption: z.string().optional(),
    exifDate: z.string().optional(),
  })
  .refine(
    (data) => {
      const hasItems = Array.isArray(data.items) && data.items.length > 0
      const hasStorageKey =
        typeof data.storageKey === 'string' && data.storageKey.trim().length > 0
      return hasItems || hasStorageKey
    },
    { message: 'kind=foto requiere payload.storageKey o payload.items[]' },
  )

// ---------- helpers ----------

/**
 * Reemplazo de `validatePayloadForKind`. Devuelve `null` si todo OK, o un
 * mensaje humano si rechaza — mismo contrato que el viejo validator manual
 * para minimizar churn en los call sites.
 */
export function validateMomentoPayload(
  kind: MomentoKind,
  payload: unknown,
): string | null {
  const schema =
    kind === 'nota'
      ? MomentoNotaPayloadSchema
      : kind === 'recorte'
        ? MomentoRecortePayloadSchema
        : kind === 'foto'
          ? MomentoFotoPayloadSchema
          : null
  if (!schema) return `kind desconocido: ${kind}`

  const result = schema.safeParse(payload)
  if (result.success) return null
  // El primer issue es el más informativo en la mayoría de los casos.
  // Si necesitamos todos, usar `result.error.issues.map(...)`.
  return result.error.issues[0]?.message ?? 'payload inválido'
}

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
