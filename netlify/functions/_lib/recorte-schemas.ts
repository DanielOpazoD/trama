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
  /** Enriquecimiento diferido del enlace (metadatos OG que llegan tras crear
   *  el recorte de forma optimista). Solo se aplican si vienen presentes. */
  sourceTitle: optionalShort,
  sourceAuthor: optionalShort,
  imageUrl: z.string().trim().url().max(2000).nullish(),
})

const PromoteQuoteBody = z.object({
  target: z.literal('quote'),
  quote: z.object({
    entityId: z.string().uuid(),
    text: trimmedText,
    source: z.string().trim().max(500).nullish(),
    context: z.string().trim().max(2000).nullish(),
    link: z.string().trim().url().max(2000).nullish(),
    userReflection: z.string().trim().max(4000).nullish(),
  }),
})

const PromoteEntityBody = z.object({
  target: z.literal('entity'),
  entity: z.object({
    type: z.string().trim().min(1, 'type requerido').max(100),
    name: z.string().trim().min(1, 'name requerido').max(200),
    year: z.number().nullable().optional(),
    description: z.string().trim().max(2000).nullish(),
  }),
})

const PromoteMomentoBody = z.object({
  target: z.literal('momento'),
  momento: z.object({
    kind: z.enum(['nota', 'recorte', 'foto']),
    payload: z.record(z.string(), z.unknown()),
    note: z.string().trim().max(2000).nullish(),
    capturedAt: z.string().datetime({ offset: true }).nullish(),
  }),
})

/** Promoción transaccional: el servidor crea el objeto destino y marca el
 *  recorte en la misma sentencia SQL. Si el recorte ya fue promovido, la
 *  operación devuelve la fila existente sin crear otro destino. */
export const RecortePromoteBody = z.discriminatedUnion('target', [
  PromoteQuoteBody,
  PromoteEntityBody,
  PromoteMomentoBody,
])

export const ApiTokenCreateBody = z.object({
  label: z.string().trim().min(1).max(100).default('extensión de Chrome'),
})
