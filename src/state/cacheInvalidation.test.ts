import { describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '../test-utils'
import { queryKeys } from './queryClient'
import {
  invalidateEntityCreateSurface,
  invalidateEntityDeleteSurface,
  invalidateEntityRestoreSurface,
  invalidateEntityUpdateSurface,
  invalidateMomentoShareAccessSurface,
  invalidateMomentoShareInvitationResponseSurface,
  invalidateMomentosSurface,
  invalidateAttachmentOwnerSurface,
  invalidateNoteMutationSurface,
  invalidateNotesPromotionSurface,
  invalidateQuoteCreateSurface,
  invalidateQuoteDeleteSurface,
  invalidateQuoteRestoreSurface,
  invalidateQuoteUpdateSurface,
  invalidateRecorteCreateSurface,
  invalidateRecorteMutationSurface,
  invalidateRecortePromotionSurface,
  invalidateSearchSurface,
  invalidateRelationshipCreateSurface,
  invalidateRelationshipDeleteSurface,
  invalidateRelationshipRestoreSurface,
  invalidateRelationshipUpdateSurface,
  invalidateTasksSurface,
} from './cacheInvalidation'

function invalidatedKeys(qc: ReturnType<typeof makeQueryClient>) {
  return vi
    .spyOn(qc, 'invalidateQueries')
    .mockImplementation(() => Promise.resolve(undefined))
}

function queryKeysFrom(spy: ReturnType<typeof invalidatedKeys>) {
  return spy.mock.calls.map(([filters]) => filters?.queryKey)
}

describe('cacheInvalidation', () => {
  it('centraliza la superficie de notas y su promoción a momento', () => {
    const qc = makeQueryClient()
    const spy = invalidatedKeys(qc)

    invalidateNoteMutationSurface(qc)
    invalidateNotesPromotionSurface(qc)
    invalidateSearchSurface(qc)

    expect(queryKeysFrom(spy)).toEqual([
      queryKeys.notes,
      queryKeys.notasFeed,
      queryKeys.search,
      queryKeys.notes,
      queryKeys.notasFeed,
      queryKeys.search,
      queryKeys.momentosInfinite,
      queryKeys.cronologiaInfinite,
      queryKeys.home,
      queryKeys.search,
    ])
  })

  it('centraliza recortes, creación y targets de promoción', () => {
    const qc = makeQueryClient()
    const spy = invalidatedKeys(qc)

    invalidateRecorteMutationSurface(qc)
    invalidateRecorteCreateSurface(qc)
    invalidateRecortePromotionSurface(qc, 'quote')
    invalidateRecortePromotionSurface(qc, 'entity')
    invalidateRecortePromotionSurface(qc, 'momento')

    expect(queryKeysFrom(spy)).toEqual([
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.search,
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.search,
      queryKeys.counts,
      queryKeys.home,
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.search,
      queryKeys.quotes,
      queryKeys.quotesInfinite,
      queryKeys.counts,
      queryKeys.home,
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.search,
      queryKeys.entities,
      queryKeys.counts,
      queryKeys.home,
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.search,
      queryKeys.momentosInfinite,
      queryKeys.counts,
      queryKeys.home,
    ])
  })

  it('centraliza momentos y share access', () => {
    const qc = makeQueryClient()
    const spy = invalidatedKeys(qc)

    invalidateMomentosSurface(qc)
    invalidateMomentoShareAccessSurface(qc)
    invalidateMomentoShareInvitationResponseSurface(qc)

    expect(queryKeysFrom(spy)).toEqual([
      queryKeys.momentosInfinite,
      queryKeys.home,
      queryKeys.cronologiaInfinite,
      queryKeys.atlas,
      queryKeys.search,
      queryKeys.momentoShareAccess,
      queryKeys.momentosInfinite,
      queryKeys.home,
      queryKeys.cronologiaInfinite,
      queryKeys.momentoShareInvitations,
      queryKeys.momentoShareAccess,
      queryKeys.momentosInfinite,
      queryKeys.home,
      queryKeys.cronologiaInfinite,
    ])
  })

  it('centraliza attachments y refresca el owner derivado correcto', () => {
    const qc = makeQueryClient()
    const spy = invalidatedKeys(qc)

    invalidateAttachmentOwnerSurface(qc, 'note', 'n1')
    invalidateAttachmentOwnerSurface(qc, 'task', 't1')
    invalidateAttachmentOwnerSurface(qc, 'prompt', 'p1')

    expect(queryKeysFrom(spy)).toEqual([
      queryKeys.notasAttachments('note', 'n1'),
      queryKeys.notes,
      queryKeys.notasFeed,
      queryKeys.search,
      queryKeys.notasAttachments('task', 't1'),
      queryKeys.tasks,
      queryKeys.notasAttachments('prompt', 'p1'),
    ])
  })

  it('centraliza entidades, citas, relaciones y tareas core', () => {
    const qc = makeQueryClient()
    const spy = invalidatedKeys(qc)

    invalidateEntityCreateSurface(qc)
    invalidateEntityUpdateSurface(qc)
    invalidateEntityDeleteSurface(qc)
    invalidateEntityRestoreSurface(qc)
    invalidateQuoteCreateSurface(qc)
    invalidateQuoteUpdateSurface(qc)
    invalidateQuoteDeleteSurface(qc)
    invalidateQuoteRestoreSurface(qc)
    invalidateRelationshipCreateSurface(qc)
    invalidateRelationshipUpdateSurface(qc)
    invalidateRelationshipDeleteSurface(qc)
    invalidateRelationshipRestoreSurface(qc)
    invalidateTasksSurface(qc)

    expect(queryKeysFrom(spy)).toEqual([
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.entitiesInfinite,
      queryKeys.home,
      queryKeys.atlas,
      queryKeys.cronologiaInfinite,
      queryKeys.entitiesInfinite,
      queryKeys.home,
      queryKeys.atlas,
      queryKeys.cronologiaInfinite,
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.entitiesInfinite,
      queryKeys.quotesInfinite,
      queryKeys.relationshipsInfinite,
      queryKeys.home,
      queryKeys.atlas,
      queryKeys.cronologiaInfinite,
      queryKeys.momentosInfinite,
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
      queryKeys.quotesInfinite,
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.home,
      queryKeys.quotesInfinite,
      queryKeys.home,
      queryKeys.quotesInfinite,
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.home,
      queryKeys.quotes,
      queryKeys.quotesInfinite,
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.home,
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.relationshipsInfinite,
      queryKeys.home,
      queryKeys.relationshipsInfinite,
      queryKeys.home,
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.relationshipsInfinite,
      queryKeys.home,
      queryKeys.relationships,
      queryKeys.counts,
      queryKeys.entityRefsCount,
      queryKeys.relationshipsInfinite,
      queryKeys.home,
      queryKeys.tasks,
      queryKeys.cronologiaInfinite,
      queryKeys.home,
    ])
  })
})
