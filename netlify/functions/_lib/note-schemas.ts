import { z } from 'zod'

/**
 * Schemas Zod de Trama Notas (POST/PATCH /api/notes).
 * Las etiquetas NO se reciben del cliente: se derivan del contenido en el
 * server (parseTags), para que el #tag del texto sea la única fuente de verdad.
 */
export const NoteCreateBody = z.object({
  content: z.string().min(1, 'La nota no puede estar vacía').max(20000),
  /** Título opcional y corto. Vacío/espacios se normalizan a null en el handler. */
  title: z.string().max(200).optional(),
  pinned: z.boolean().optional(),
})
export type NoteCreateBodyT = z.infer<typeof NoteCreateBody>

export const NotePatchBody = z.object({
  content: z.string().min(1).max(20000).optional(),
  /** `null` borra el título; ausente lo deja como está; string lo fija. */
  title: z.string().max(200).nullable().optional(),
  pinned: z.boolean().optional(),
})
export type NotePatchBodyT = z.infer<typeof NotePatchBody>
