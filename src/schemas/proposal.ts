/**
 * FF2 — schemas Zod para propuestas de IA (extract, chat, reclassify).
 *
 * Las shapes de `ProposedEntity`, `ProposedQuote`, `ProposedRelationship`,
 * `ProposedEntityEdit`, etc. vivían duplicadas en:
 *   - `src/types.ts`               (lo que el cliente consume)
 *   - `_lib/extract-validate.ts`   (lo que el server produce)
 *   - `_lib/chat-validate.ts`      (lo que sale del marker `<<<TRAMA-PROPOSAL>>>`)
 *
 * Con tres copias del mismo shape el drift es inevitable. Acá vive la
 * definición canónica vía Zod; los tipos se infieren con `z.infer` y se
 * re-exportan desde `types.ts`.
 *
 * Nota: los validadores en `_lib/*-validate.ts` siguen siendo "cleaners"
 * (filtran items inválidos en vez de rechazar el bloque entero), no son
 * `safeParse` directo. Eso es deliberado: la IA a veces devuelve JSON
 * casi-bueno y queremos rescatar lo válido. Las schemas acá definen
 * el "objetivo" del cleaner, no su algoritmo.
 */

import { z } from 'zod'

// ---------- propuestas para crear (transientes — no persistidas) ----------

/** Entidad nueva que la IA quiere crear, o referencia a una existente
 *  (`matchedId`). El cliente decide si crear (opt-in checkbox). */
export const ProposedEntitySchema = z.object({
  matchedId: z.string().optional(),
  type: z.string(),
  name: z.string(),
  year: z.number().optional(),
  description: z.string().optional(),
  spotifyUrl: z.string().optional(),
})

export const ProposedRelationshipSchema = z.object({
  fromName: z.string(),
  toName: z.string(),
  type: z.string(),
  notes: z.string().optional(),
  /** Opcional second-model review cuando corrió cross-verification. */
  verification: z
    .object({
      agreed: z.boolean(),
      note: z.string().optional(),
      verifier: z.string(),
    })
    .optional(),
})

export const ProposedQuoteSchema = z.object({
  entityName: z.string(),
  text: z.string(),
  source: z.string().optional(),
  context: z.string().optional(),
})

// ---------- edits propuestos a filas existentes ----------

/** El id apunta a la entidad/cita/relación existente. El patch lleva
 *  SOLO los campos que la IA quiere cambiar. Checkbox per-row. */
export const ProposedEntityEditSchema = z.object({
  kind: z.literal('entity'),
  id: z.string(),
  /** Nombre para mostrar en la UI como contexto — no es parte del patch. */
  name: z.string(),
  patch: z.object({
    name: z.string().optional(),
    type: z.string().optional(),
    year: z.number().nullable().optional(),
    description: z.string().nullable().optional(),
    essay: z.string().nullable().optional(),
    spotifyUrl: z.string().nullable().optional(),
  }),
  reason: z.string().optional(),
})

export const ProposedQuoteEditSchema = z.object({
  kind: z.literal('quote'),
  id: z.string(),
  /** Texto truncado + entityName para contexto. */
  preview: z.string(),
  entityName: z.string().optional(),
  patch: z.object({
    text: z.string().optional(),
    source: z.string().nullable().optional(),
    context: z.string().nullable().optional(),
    entityId: z.string().optional(),
    userReflection: z.string().nullable().optional(),
  }),
  reason: z.string().optional(),
})

export const ProposedRelationshipEditSchema = z.object({
  kind: z.literal('relationship'),
  id: z.string(),
  preview: z.string(),
  patch: z.object({
    type: z.string().optional(),
    notes: z.string().nullable().optional(),
  }),
  reason: z.string().optional(),
})

export const ProposedEditSchema = z.discriminatedUnion('kind', [
  ProposedEntityEditSchema,
  ProposedQuoteEditSchema,
  ProposedRelationshipEditSchema,
])

// ---------- deletes propuestos ----------

export const ProposedDeleteSchema = z.object({
  kind: z.enum(['entity', 'quote', 'relationship']),
  id: z.string(),
  preview: z.string(),
  reason: z.string().optional(),
})

// ---------- types inferidos (re-exportados desde types.ts) ----------

export type ProposedEntity = z.infer<typeof ProposedEntitySchema>
export type ProposedRelationship = z.infer<typeof ProposedRelationshipSchema>
export type ProposedQuote = z.infer<typeof ProposedQuoteSchema>
export type ProposedEntityEdit = z.infer<typeof ProposedEntityEditSchema>
export type ProposedQuoteEdit = z.infer<typeof ProposedQuoteEditSchema>
export type ProposedRelationshipEdit = z.infer<typeof ProposedRelationshipEditSchema>
export type ProposedEdit = z.infer<typeof ProposedEditSchema>
export type ProposedDelete = z.infer<typeof ProposedDeleteSchema>
