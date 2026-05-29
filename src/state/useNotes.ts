/**
 * τ-worlds Fase 2: hooks de Trama Notas.
 *
 * `useNotesQuery()` lista todas las notas (el filtrado por texto/tag se hace
 * client-side en la vista — instantáneo y sin refetch). Las mutaciones
 * invalidan la cache de notas para mantener la lista fresca.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

const NOTES_KEY = ['notes'] as const

export function useNotesQuery() {
  return useQuery({
    queryKey: NOTES_KEY,
    queryFn: () => api.notes.list(),
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => api.notes.create(content),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: { content?: string; pinned?: boolean }
    }) => api.notes.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.notes.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTES_KEY }),
  })
}
