import { z } from 'zod'

/**
 * Bodies de las mesas/proyectos editoriales — persistir la mesa de Flujo
 * (título + materiales elegidos + borrador Markdown).
 */

export const ReadingTableCreateBody = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(200),
  materialIds: z.array(z.string().max(200)).max(500).optional(),
  draftMarkdown: z.string().max(200_000).nullish(),
})

export const ReadingTablePatchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  materialIds: z.array(z.string().max(200)).max(500).optional(),
  draftMarkdown: z.string().max(200_000).nullish().optional(),
  status: z.enum(['borrador', 'redactando', 'revisando', 'cerrado']).optional(),
})
