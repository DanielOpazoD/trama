/**
 * Hooks de Tareas (Trama Notas).
 *
 * Hay tres formas de leer tareas, todas bajo el prefijo de cache `['tasks']`:
 *  - `useTasksQuery()` — TODAS (para búsqueda global y export). Trae mucho; úsalo
 *    solo donde de verdad se necesita el conjunto completo.
 *  - `useTasksRange()` — acotado a un rango de semanas (+ arrastre). Es lo que usa
 *    la vista de Tareas, para no traer años de historial.
 *  - `usePendingTasks()` — solo pendientes (para el "Pendientes" del inicio).
 *
 * Las mutaciones aplican el cambio de forma optimista sobre CUALQUIER variante
 * en cache (`setQueriesData` con el prefijo) e invalidan el prefijo al asentar.
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { api } from '../api'
import type { Task, TaskCreate, TaskPatch } from '../api'
import { queryKeys } from './queryClient'
import { useToast } from './toast'

const TASKS_KEY = queryKeys.tasks

export function useTasksQuery(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: () => api.tasks.list(),
    enabled: opts?.enabled ?? true,
  })
}

export function useTasksRange(opts: {
  weekFrom: string
  weekTo: string
  carryBefore: string | null
}) {
  return useQuery({
    queryKey: queryKeys.tasksRange(opts.weekFrom, opts.weekTo, opts.carryBefore),
    queryFn: () =>
      api.tasks.list({
        weekFrom: opts.weekFrom,
        weekTo: opts.weekTo,
        carryBefore: opts.carryBefore ?? undefined,
      }),
    // Al navegar de mes, conserva el anterior hasta que llega el nuevo (sin flash).
    placeholderData: keepPreviousData,
  })
}

export function usePendingTasks() {
  return useQuery({
    queryKey: queryKeys.tasksPending,
    queryFn: () => api.tasks.list({ pending: true }),
  })
}

/** Campos de un patch aplicables al objeto en cache (los definidos). */
function applyPatch(task: Task, patch: TaskPatch): Task {
  return {
    ...task,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.detail !== undefined ? { detail: patch.detail } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.weekStart !== undefined ? { weekStart: patch.weekStart } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.done !== undefined ? { done: patch.done } : {}),
  }
}

function invalidateTasks(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: TASKS_KEY })
  qc.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
  qc.invalidateQueries({ queryKey: queryKeys.home })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TaskCreate) => api.tasks.create(input),
    onSuccess: () => invalidateTasks(qc),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) =>
      api.tasks.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: TASKS_KEY })
      // Snapshot de todas las variantes de tareas en cache, para revertir.
      const previous = qc.getQueriesData<Task[]>({ queryKey: TASKS_KEY })
      qc.setQueriesData<Task[]>({ queryKey: TASKS_KEY }, (prev) =>
        (prev ?? []).map((t) => (t.id === id ? applyPatch(t, patch) : t)),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data)
    },
    onSettled: () => invalidateTasks(qc),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.tasks.remove(id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: TASKS_KEY })
      const previous = qc.getQueriesData<Task[]>({ queryKey: TASKS_KEY })
      qc.setQueriesData<Task[]>({ queryKey: TASKS_KEY }, (prev) =>
        (prev ?? []).filter((t) => t.id !== id),
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data)
    },
    onSuccess: ({ deletedAt }, id) => {
      // Deshacer: revive tarea + fotos con ese deleted_at exacto.
      if (deletedAt) {
        toast.show({
          message: 'Tarea eliminada',
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.tasks.restore(id, deletedAt)
              invalidateTasks(qc)
            },
          },
        })
      }
    },
    onSettled: () => invalidateTasks(qc),
  })
}
