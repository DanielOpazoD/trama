import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../api'
import type { Momento, MomentoKind, MomentoPayload } from '../types'

/**
 * ξ — hooks de TanStack Query para Momentos.
 *
 * useInfiniteMomentosQuery: timeline paginado por cursor. Returna pages.
 * useAddMomento / useUpdateMomento / useDeleteMomento: mutaciones que
 * invalidan la query infinite.
 */

const MOMENTOS_INFINITE = ['momentos', 'infinite'] as const

type ListResult = { items: Momento[]; nextCursor: string | null }

export function useInfiniteMomentosQuery(opts?: { kind?: MomentoKind }) {
  return useInfiniteQuery<ListResult>({
    queryKey: [...MOMENTOS_INFINITE, opts?.kind ?? 'all'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.listMomentos({
        cursor: pageParam as string | null,
        limit: 30,
        kind: opts?.kind,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

export function useAddMomento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      kind: MomentoKind
      payload: MomentoPayload
      note?: string
      capturedAt?: string
      entityIds?: string[]
    }) => api.createMomento(data),
    onSuccess: () => {
      // Invalidamos todas las variantes de filtro (all + kind=foto, etc.)
      queryClient.invalidateQueries({ queryKey: MOMENTOS_INFINITE })
    },
  })
}

export function useUpdateMomento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: Partial<{
        payload: MomentoPayload
        note: string | null
        capturedAt: string
        entityIds: string[]
      }>
    }) => api.updateMomento(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MOMENTOS_INFINITE })
    },
  })
}

export function useDeleteMomento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteMomento(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MOMENTOS_INFINITE })
    },
  })
}
