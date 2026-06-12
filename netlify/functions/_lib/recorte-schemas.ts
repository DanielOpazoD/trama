import { z } from 'zod'

/** Bodies del módulo Recortes (bandeja de capturas web). */

const trimmedText = z
  .string()
  .trim()
  .min(1, 'El texto del recorte no puede estar vacío')
  .max(20000, 'El recorte es demasiado largo')

const optionalShort = z.string().trim().max(500).nullish()

/** Cómo se capturó el recorte (Bloque B+). 'citation' = selección. */
export const CaptureMode = z.enum(['citation', 'article', 'html', 'region', 'image'])

export const RecorteCreateBody = z.object({
  text: trimmedText,
  sourceUrl: z.string().trim().url('URL de origen inválida').max(2000).nullish(),
  sourceTitle: optionalShort,
  sourceAuthor: optionalShort,
  note: z.string().trim().max(2000).nullish(),
  /** Imagen externa: la URL http real del <img> (menú "Guardar imagen"). */
  imageUrl: z.string().trim().url().max(2000).nullish(),
  /** Imagen interna: blob authed del store recortes-media (región/screenshot). */
  imageKey: z.string().trim().max(200).nullish(),
  captureMode: CaptureMode.nullish(),
  /** Cuándo se capturó en el browser (la extensión lo manda). */
  capturedAt: z.string().datetime({ offset: true }).nullish(),
})

export const RecortePatchBody = z.object({
  text: trimmedText.optional(),
  note: z.string().trim().max(2000).nullish().optional(),
  status: z.enum(['pending', 'archived']).optional(),
})

/** Promoción: el objeto destino se crea con su endpoint propio desde el
 *  cliente (reusa optimistic updates y validaciones existentes); acá solo
 *  se registra el resultado de forma trazable. */
export const RecortePromoteBody = z.object({
  target: z.enum(['quote', 'entity', 'momento']),
  promotedId: z.string().uuid(),
})

export const ApiTokenCreateBody = z.object({
  label: z.string().trim().min(1).max(100).default('extensión de Chrome'),
})
