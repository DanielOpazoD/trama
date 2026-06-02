/**
 * τ-worlds Fase 3: hooks de Tareas (Trama Notas).
 *
 * `useTasksQuery()` lista todas las tareas (el filtrado por texto/tag se hace
 * client-side en la vista). `useUpdateTask` aplica el patch en cache al
 * instante (onMutate) para que el check de "hecho" y las ediciones se sientan
 * inmediatos; create/delete invalidan y refetchean.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Task, TaskCreate, TaskPatch } from '../api'
import { queryKeys } from './queryClient'

const TASKS_KEY = queryKeys.tasks

export function useTasksQuery() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: () => api.tasks.list(),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: TaskCreate) => api.tasks.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      qc.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) =>
      api.tasks.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: TASKS_KEY })
      const previous = qc.getQueryData<Task[]>(TASKS_KEY) ?? []
      qc.setQueryData<Task[]>(TASKS_KEY, (prev) =>
        (prev ?? []).map((t) =>
          t.id === id
            ? {
                ...t,
                ...(patch.title !== undefined ? { title: patch.title } : {}),
                ...(patch.detail !== undefined ? { detail: patch.detail } : {}),
                ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
                ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
                ...(patch.weekStart !== undefined ? { weekStart: patch.weekStart } : {}),
                ...(patch.done !== undefined ? { done: patch.done } : {}),
              }
            : t,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(TASKS_KEY, context.previous)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      qc.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.tasks.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TASKS_KEY })
      qc.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      qc.invalidateQueries({ queryKey: queryKeys.home })
    },
  })
}
