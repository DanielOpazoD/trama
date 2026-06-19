import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { NotasAttachmentOwner, RecorteTarget } from '../api'
import { queryKeys } from './queryClient'

function invalidateMany(queryClient: QueryClient, keys: QueryKey[]): void {
  for (const queryKey of keys) queryClient.invalidateQueries({ queryKey })
}

export function invalidateNotesSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [queryKeys.notes, queryKeys.notasFeed])
}

export function invalidateNotesPromotionSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.notes,
    queryKeys.notasFeed,
    queryKeys.momentosInfinite,
    queryKeys.cronologiaInfinite,
    queryKeys.home,
  ])
}

export function invalidateRecortesSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [queryKeys.recortes, queryKeys.notasFeed])
}

export function invalidateRecorteCreateSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.recortes,
    queryKeys.notasFeed,
    queryKeys.counts,
    queryKeys.home,
  ])
}

export function invalidateRecortePromotionSurface(
  queryClient: QueryClient,
  target: RecorteTarget,
): void {
  const targetKeys =
    target === 'quote'
      ? [queryKeys.quotes, queryKeys.quotesInfinite]
      : target === 'entity'
        ? [queryKeys.entities]
        : [queryKeys.momentosInfinite]

  invalidateMany(queryClient, [
    queryKeys.recortes,
    queryKeys.notasFeed,
    ...targetKeys,
    queryKeys.counts,
    queryKeys.home,
  ])
}

export function invalidateRecorteUnpromoteSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.recortes,
    queryKeys.notasFeed,
    queryKeys.quotes,
    queryKeys.quotesInfinite,
    queryKeys.entities,
    queryKeys.momentosInfinite,
    queryKeys.counts,
    queryKeys.home,
  ])
}

export function invalidateMomentosSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.momentosInfinite,
    queryKeys.home,
    queryKeys.cronologiaInfinite,
    queryKeys.atlas,
  ])
}

export function invalidateMomentoShareAccessSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.momentoShareAccess,
    queryKeys.momentosInfinite,
    queryKeys.home,
    queryKeys.cronologiaInfinite,
  ])
}

export function invalidateMomentoShareInvitationResponseSurface(
  queryClient: QueryClient,
): void {
  invalidateMany(queryClient, [
    queryKeys.momentoShareInvitations,
    queryKeys.momentoShareAccess,
    queryKeys.momentosInfinite,
    queryKeys.home,
    queryKeys.cronologiaInfinite,
  ])
}

export function invalidateNotasAttachmentOwner(
  queryClient: QueryClient,
  ownerType: NotasAttachmentOwner,
  ownerId: string,
): void {
  invalidateMany(queryClient, [queryKeys.notasAttachments(ownerType, ownerId)])

  if (ownerType === 'task') {
    invalidateMany(queryClient, [queryKeys.tasks])
  }
  if (ownerType === 'note') {
    invalidateMany(queryClient, [queryKeys.notes, queryKeys.notasFeed])
  }
}
