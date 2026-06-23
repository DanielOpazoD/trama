import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { NotasAttachmentOwner, RecorteTarget } from '../api'
import { queryKeys } from './queryClient'

function invalidateMany(queryClient: QueryClient, keys: QueryKey[]): void {
  for (const queryKey of keys) queryClient.invalidateQueries({ queryKey })
}

export function invalidateSearchSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [queryKeys.search])
}

export function invalidateEntityCreateSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.counts,
    queryKeys.entityRefsCount,
    queryKeys.entitiesInfinite,
    queryKeys.home,
    queryKeys.atlas,
    queryKeys.cronologiaInfinite,
  ])
}

export function invalidateEntityUpdateSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.entitiesInfinite,
    queryKeys.home,
    queryKeys.atlas,
    queryKeys.cronologiaInfinite,
  ])
}

export function invalidateEntityDeleteSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.counts,
    queryKeys.entityRefsCount,
    queryKeys.entitiesInfinite,
    queryKeys.quotesInfinite,
    queryKeys.relationshipsInfinite,
    queryKeys.home,
    queryKeys.atlas,
    queryKeys.cronologiaInfinite,
    queryKeys.momentosInfinite,
  ])
}

export function invalidateEntityRestoreSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.entities,
    queryKeys.relationships,
    queryKeys.quotes,
    queryKeys.counts,
    queryKeys.entityRefsCount,
    queryKeys.entitiesInfinite,
    queryKeys.relationshipsInfinite,
    queryKeys.quotesInfinite,
    queryKeys.home,
    queryKeys.atlas,
    queryKeys.cronologiaInfinite,
    queryKeys.momentosInfinite,
  ])
}

export function invalidateQuoteCreateSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.quotesInfinite,
    queryKeys.counts,
    queryKeys.entityRefsCount,
    queryKeys.home,
  ])
}

export function invalidateQuoteUpdateSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [queryKeys.quotesInfinite, queryKeys.home])
}

export function invalidateQuoteDeleteSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.quotesInfinite,
    queryKeys.counts,
    queryKeys.entityRefsCount,
    queryKeys.home,
  ])
}

export function invalidateQuoteRestoreSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.quotes,
    queryKeys.quotesInfinite,
    queryKeys.counts,
    queryKeys.entityRefsCount,
    queryKeys.home,
  ])
}

export function invalidateRelationshipCreateSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.counts,
    queryKeys.entityRefsCount,
    queryKeys.relationshipsInfinite,
    queryKeys.home,
  ])
}

export function invalidateRelationshipUpdateSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [queryKeys.relationshipsInfinite, queryKeys.home])
}

export function invalidateRelationshipDeleteSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.counts,
    queryKeys.entityRefsCount,
    queryKeys.relationshipsInfinite,
    queryKeys.home,
  ])
}

export function invalidateRelationshipRestoreSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.relationships,
    queryKeys.counts,
    queryKeys.entityRefsCount,
    queryKeys.relationshipsInfinite,
    queryKeys.home,
  ])
}

export function invalidateTasksSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.tasks,
    queryKeys.cronologiaInfinite,
    queryKeys.home,
  ])
}

export function invalidateNoteMutationSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [queryKeys.notes, queryKeys.notasFeed, queryKeys.search])
}

export function invalidateNotesPromotionSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.notes,
    queryKeys.notasFeed,
    queryKeys.search,
    queryKeys.momentosInfinite,
    queryKeys.cronologiaInfinite,
    queryKeys.home,
  ])
}

export function invalidateRecorteMutationSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [queryKeys.recortes, queryKeys.notasFeed, queryKeys.search])
}

export function invalidateRecorteCreateSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.recortes,
    queryKeys.notasFeed,
    queryKeys.search,
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
    queryKeys.search,
    ...targetKeys,
    queryKeys.counts,
    queryKeys.home,
  ])
}

export function invalidateRecorteUnpromoteSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.recortes,
    queryKeys.notasFeed,
    queryKeys.search,
    queryKeys.quotes,
    queryKeys.quotesInfinite,
    queryKeys.entities,
    queryKeys.momentosInfinite,
    queryKeys.counts,
    queryKeys.home,
  ])
}

export function invalidateBibliotecaSurface(queryClient: QueryClient): void {
  // El prefijo `['biblioteca', 'infinite']` cubre TODAS las variantes de filtro
  // (tab/q/orden/tipo/fuente) y la papelera, así que un solo invalidate
  // reconcilia la lista entera tras renombrar / eliminar / restaurar.
  invalidateMany(queryClient, [queryKeys.bibliotecaInfinite])
}

export function invalidateMomentosSurface(queryClient: QueryClient): void {
  invalidateMany(queryClient, [
    queryKeys.momentosInfinite,
    queryKeys.home,
    queryKeys.cronologiaInfinite,
    queryKeys.atlas,
    queryKeys.search,
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

export function invalidateAttachmentOwnerSurface(
  queryClient: QueryClient,
  ownerType: NotasAttachmentOwner,
  ownerId: string,
): void {
  invalidateMany(queryClient, [queryKeys.notasAttachments(ownerType, ownerId)])

  if (ownerType === 'task') {
    invalidateMany(queryClient, [queryKeys.tasks])
  }
  if (ownerType === 'note') {
    invalidateMany(queryClient, [queryKeys.notes, queryKeys.notasFeed, queryKeys.search])
  }
}
