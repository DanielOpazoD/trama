import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../api'
import type { MomentoShareRole } from '../api/momentos'
import type { Momento, MomentoKind, MomentoPayload } from '../types'
import { queryKeys } from './queryClient'

/**
 * ξ — hooks de TanStack Query para Momentos.
 *
 * useInfiniteMomentosQuery: timeline paginado por cursor. Returna pages.
 * useAddMomento / useUpdateMomento / useDeleteMomento: mutaciones que
 * invalidan la query infinite.
 */

const MOMENTOS_INFINITE = queryKeys.momentosInfinite

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
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.atlas })
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
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.atlas })
    },
  })
}

export function useDeleteMomento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteMomento(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MOMENTOS_INFINITE })
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.atlas })
    },
  })
}

/**
 * EE: fusionar N momentos foto en uno solo. El primary sobrevive con
 * todos los items combinados, los others quedan soft-deleted. Útil para
 * agrupar fotos rescatadas del preview o reorganizar eventos.
 */
export function useMergeMomentos() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      primaryId: string
      otherIds: string[]
      note?: string | null
      capturedAt?: string
    }) => api.mergeMomentos(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MOMENTOS_INFINITE })
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
      queryClient.invalidateQueries({ queryKey: queryKeys.atlas })
    },
  })
}

export function useMomentoShareInvitationsQuery() {
  return useQuery({
    queryKey: queryKeys.momentoShareInvitations,
    queryFn: () => api.listMomentoShareInvitations(),
  })
}

export function useCreateMomentoShareInvitation() {
  return useMutation({
    mutationFn: (input: { email: string; role: MomentoShareRole }) =>
      api.createMomentoShareInvitation(input),
  })
}

export function useRespondMomentoShareInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
      api.respondMomentoShareInvitation(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.momentoShareInvitations })
      queryClient.invalidateQueries({ queryKey: MOMENTOS_INFINITE })
      queryClient.invalidateQueries({ queryKey: queryKeys.home })
      queryClient.invalidateQueries({ queryKey: queryKeys.cronologiaInfinite })
    },
  })
}
