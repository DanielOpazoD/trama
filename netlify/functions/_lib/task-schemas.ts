import { z } from 'zod'

/**
 * Schemas Zod de Tareas (POST/PATCH /api/tasks).
 *
 * Como en Notas, las etiquetas NO se reciben del cliente: se derivan de
 * título+detalle en el server (parseTags). `dueDate` es solo fecha
 * (YYYY-MM-DD) o null; el resto de campos del PATCH son opcionales.
 */
const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (esperado YYYY-MM-DD)')
  .nullable()

export const TaskCreateBody = z.object({
  title: z.string().min(1, 'La tarea necesita un título').max(500),
  detail: z.string().max(20000).nullable().optional(),
  dueDate: dueDate.optional(),
})
export type TaskCreateBodyT = z.infer<typeof TaskCreateBody>

export const TaskPatchBody = z.object({
  title: z.string().min(1).max(500).optional(),
  detail: z.string().max(20000).nullable().optional(),
  done: z.boolean().optional(),
  dueDate: dueDate.optional(),
})
export type TaskPatchBodyT = z.infer<typeof TaskPatchBody>
