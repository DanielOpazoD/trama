import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { api } from '../api'
import type { MomentoFeedback, MomentoReaction, MomentoShareRole } from '../api/momentos'
import type { Momento, MomentoKind, MomentoPayload } from '../types'
import {
  invalidateMomentoShareAccessSurface,
  invalidateMomentoShareInvitationResponseSurface,
  invalidateMomentosSurface,
} from './cacheInvalidation'
import { queryKeys } from './queryClient'
import { useToast } from './toast'

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
      invalidateMomentosSurface(queryClient)
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
      invalidateMomentosSurface(queryClient)
    },
  })
}

export function useDeleteMomento() {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (id: string) => api.deleteMomento(id),
    onSuccess: ({ deletedAt }, id) => {
      invalidateMomentosSurface(queryClient)
      // Deshacer: restoreMomento revive el momento + sus links de entidades
      // cuyo deleted_at coincide (mismo contrato que entidades/citas).
      if (deletedAt) {
        toast.show({
          message: 'Momento eliminado',
          durationMs: 10_000,
          action: {
            label: 'Deshacer',
            onAction: async () => {
              await api.restoreMomento(id, deletedAt)
              invalidateMomentosSurface(queryClient)
            },
          },
        })
      }
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
      invalidateMomentosSurface(queryClient)
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
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { email: string; role: MomentoShareRole }) =>
      api.createMomentoShareInvitation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.momentoShareInvitations })
    },
  })
}

export function useMomentoShareAccessQuery() {
  return useQuery({
    queryKey: queryKeys.momentoShareAccess,
    queryFn: () => api.listMomentoShareAccess(),
  })
}

export function useRevokeMomentoShareAccess() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => api.revokeMomentoShareAccess(userId),
    onSuccess: () => {
      invalidateMomentoShareAccessSurface(queryClient)
    },
  })
}

export function useUpdateMomentoShareAccessRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MomentoShareRole }) =>
      api.updateMomentoShareAccessRole(userId, role),
    onSuccess: () => {
      invalidateMomentoShareAccessSurface(queryClient)
    },
  })
}

export function useRespondMomentoShareInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) =>
      api.respondMomentoShareInvitation(id, action),
    onSuccess: () => {
      invalidateMomentoShareInvitationResponseSurface(queryClient)
    },
  })
}

export function useMomentoFeedbackQuery(momentoId: string) {
  return useQuery({
    queryKey: queryKeys.momentoFeedback(momentoId),
    queryFn: () => api.getMomentoFeedback(momentoId),
  })
}

function mergeReaction(
  current: MomentoFeedback | undefined,
  reaction: MomentoReaction,
): MomentoFeedback | undefined {
  if (!current) return current
  const without = current.reactions.filter((r) => r.reaction !== reaction.reaction)
  return { ...current, reactions: [...without, reaction] }
}

export function useCreateMomentoComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { momentoId: string; body: string }) =>
      api.createMomentoComment(input),
    onSuccess: ({ comment }, { momentoId }) => {
      queryClient.setQueryData<MomentoFeedback>(
        queryKeys.momentoFeedback(momentoId),
        (current) => ({
          comments: [...(current?.comments ?? []), comment],
          reactions: current?.reactions ?? [],
        }),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.momentoFeedback(momentoId) })
    },
  })
}

export function useSetMomentoReaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { momentoId: string; reaction?: 'heart' }) =>
      api.setMomentoReaction(input),
    onSuccess: ({ reaction }, { momentoId }) => {
      queryClient.setQueryData<MomentoFeedback>(
        queryKeys.momentoFeedback(momentoId),
        (current) => mergeReaction(current, reaction),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.momentoFeedback(momentoId) })
    },
  })
}

export function useDeleteMomentoReaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { momentoId: string; reaction?: 'heart' }) =>
      api.deleteMomentoReaction(input),
    onSuccess: (_, { momentoId, reaction = 'heart' }) => {
      queryClient.setQueryData<MomentoFeedback>(
        queryKeys.momentoFeedback(momentoId),
        (current) => {
          if (!current) return current
          return {
            ...current,
            reactions: current.reactions.map((r) =>
              r.reaction === reaction
                ? { ...r, count: Math.max(0, r.count - 1), reactedByMe: false }
                : r,
            ),
          }
        },
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.momentoFeedback(momentoId) })
    },
  })
}

export function useDeleteMomentoComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { momentoId: string; commentId: string }) =>
      api.deleteMomentoComment(input),
    onSuccess: (_, { momentoId, commentId }) => {
      queryClient.setQueryData<MomentoFeedback>(
        queryKeys.momentoFeedback(momentoId),
        (current) => {
          if (!current) return current
          return {
            ...current,
            comments: current.comments.filter((comment) => comment.id !== commentId),
          }
        },
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.momentoFeedback(momentoId) })
    },
  })
}
