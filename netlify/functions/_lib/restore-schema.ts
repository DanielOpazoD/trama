import { z } from 'zod'

/**
 * Body de los POST /:id/restore del mundo Notas (notes/tasks/prompts) —
 * mismo contrato que EntityRestoreBody: el `deletedAt` exacto que devolvió el
 * DELETE actúa como verificación optimista. Si la fila fue restaurada o
 * re-borrada entre medio (otro tab, otro dispositivo), el timestamp ya no
 * matchea y el restore es un no-op honesto (404) en vez de revivir un estado
 * que el usuario no estaba mirando.
 */
export const RestoreBody = z.object({
  deletedAt: z.string().min(1, 'deletedAt requerido'),
})
export type RestoreBodyT = z.infer<typeof RestoreBody>
