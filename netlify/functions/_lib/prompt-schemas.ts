import { z } from 'zod'

export const PromptCreateBody = z.object({
  title: z.string().min(1, 'El prompt necesita título').max(300),
  content: z.string().min(1, 'El prompt no puede estar vacío').max(50000),
  collection: z.string().max(120).nullable().optional(),
  favorite: z.boolean().optional(),
})
export type PromptCreateBodyT = z.infer<typeof PromptCreateBody>

export const PromptPatchBody = z.object({
  title: z.string().min(1).max(300).optional(),
  content: z.string().min(1).max(50000).optional(),
  collection: z.string().max(120).nullable().optional(),
  favorite: z.boolean().optional(),
  useCount: z.number().int().min(0).optional(),
})
export type PromptPatchBodyT = z.infer<typeof PromptPatchBody>
