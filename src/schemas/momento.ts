/**
 * FF2 — schemas Zod compartidos para Momentos.
 *
 * Antes había:
 *   - `src/types.ts` con `MomentoPayload` como tipo merged (todos opcionales)
 *   - `netlify/functions/_lib/momento-embed.ts → validatePayloadForKind`
 *     hacía validación manual con ifs (string check + length check por campo)
 *
 * Ahora una sola fuente de verdad por kind:
 *   - `MomentoNotaPayloadSchema`, `MomentoRecortePayloadSchema`, `MomentoFotoPayloadSchema`
 *   - Tipos inferidos via `z.infer` — no duplican estructura
 *   - `validateMomentoPayload(kind, payload)` reemplaza el validator manual
 *
 * El "merged shape" `MomentoPayload` se mantiene en `types.ts` para los
 * call sites del cliente que lo leen (es más cómodo navegar campos
 * opcionales que un discriminated union en code que no necesita validar).
 * Para escritura/validación, usar las schemas por kind acá.
 *
 * Compartido entre cliente y servidor — el cliente puede validar ANTES de
 * enviar al server, evitando roundtrips fallidos.
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
  bodyText: z
    .preprocess(
      (v) => (typeof v === 'string' ? v.trim() : v),
      z.string({ message: 'kind=nota requiere payload.bodyText no vacío' }).min(1, 'kind=nota requiere payload.bodyText no vacío'),
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
