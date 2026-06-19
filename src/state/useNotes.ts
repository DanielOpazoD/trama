/**
 * τ-worlds Fase 2: hooks de Trama Notas.
 *
 * `useNotesQuery()` lista todas las notas (el filtrado por texto/tag se hace
 * client-side en la vista — instantáneo y sin refetch). Las mutaciones
 * invalidan la cache de notas para mantener la lista fresca.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Note } from '../api'
import {
  invalidateNotesPromotionSurface,
  invalidateNotesSurface,
} from './cacheInvalidation'
import { restoreQuerySnapshot, snapshotQuery } from './cacheOptimistic'
import { queryKeys } from './queryClient'
import { patchNoteInFeed, restoreNotasFeed, snapshotNotasFeed } from './notasFeedCache'
import { useToast } from './toast'

export function useNotesQuery() {
  return useQuery({
    queryKey: queryKeys.notes,
    queryFn: () => api.notes.list(),
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { content: string; title?: string | null }) =>
      api.notes.create(input.content, { title: input.title }),
    onSuccess: () => {
      invalidateNotesSurface(qc)
    },
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
      patch: { content?: string; title?: string | null; pinned?: boolean }
    }) => api.notes.update(id, patch),
    // Optimista: aplicamos el patch en cache al instante (fijar/editar no
    // parpadea ni espera al servidor) — tanto en la lista cruda de notas como en
    // el feed paginado; si falla, restauramos ambos snapshots.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.notes })
      await qc.cancelQueries({ queryKey: queryKeys.notasFeed })
      const notesSnap = snapshotQuery<Note[]>(qc, queryKeys.notes)
      if (notesSnap.data) {
        qc.setQueryData<Note[]>(
          queryKeys.notes,
          notesSnap.data.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        )
      }
      const feedSnap = snapshotNotasFeed(qc)
      patchNoteInFeed(qc, id, patch)
      return { notesSnap, feedSnap }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.notesSnap) restoreQuerySnapshot(qc, ctx.notesSnap)
      if (ctx?.feedSnap) restoreNotasFeed(qc, ctx.feedSnap)
    },
    onSettled: () => {
      invalidateNotesSurface(qc)
    },
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.notes.remove(id),
    onSuccess: ({ deletedAt }, id) => {
      invalidateNotesSurface(qc)
      // Deshacer: el restore revive nota + anexos con ese deleted_at exacto.
      if (deletedAt) {
        toast.show({
          message: 'Nota eliminada',
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.notes.restore(id, deletedAt)
              invalidateNotesSurface(qc)
            },
          },
        })
      }
    },
  })
}

/**
 * Fase 4: promueve una nota a Momento. Al terminar invalida las notas (para
 * que la nota muestre su insignia "→ Momento") y los momentos (para que el
 * nuevo aparezca en la línea de tiempo).
 */
export function usePromoteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.notes.promote(id),
    onSuccess: () => {
      invalidateNotesPromotionSurface(qc)
    },
  })
}
