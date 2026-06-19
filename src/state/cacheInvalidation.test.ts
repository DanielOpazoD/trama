import { describe, expect, it, vi } from 'vitest'
import { makeQueryClient } from '../test-utils'
import { queryKeys } from './queryClient'
import {
  invalidateMomentoShareAccessSurface,
  invalidateMomentoShareInvitationResponseSurface,
  invalidateMomentosSurface,
  invalidateNotasAttachmentOwner,
  invalidateNotesPromotionSurface,
  invalidateNotesSurface,
  invalidateRecorteCreateSurface,
  invalidateRecortePromotionSurface,
  invalidateRecortesSurface,
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

    invalidateNotesSurface(qc)
    invalidateNotesPromotionSurface(qc)

    expect(queryKeysFrom(spy)).toEqual([
      queryKeys.notes,
      queryKeys.notasFeed,
      queryKeys.notes,
      queryKeys.notasFeed,
      queryKeys.momentosInfinite,
      queryKeys.cronologiaInfinite,
      queryKeys.home,
    ])
  })

  it('centraliza recortes, creación y targets de promoción', () => {
    const qc = makeQueryClient()
    const spy = invalidatedKeys(qc)

    invalidateRecortesSurface(qc)
    invalidateRecorteCreateSurface(qc)
    invalidateRecortePromotionSurface(qc, 'quote')
    invalidateRecortePromotionSurface(qc, 'entity')
    invalidateRecortePromotionSurface(qc, 'momento')

    expect(queryKeysFrom(spy)).toEqual([
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.counts,
      queryKeys.home,
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.quotes,
      queryKeys.quotesInfinite,
      queryKeys.counts,
      queryKeys.home,
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.entities,
      queryKeys.counts,
      queryKeys.home,
      queryKeys.recortes,
      queryKeys.notasFeed,
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

    invalidateNotasAttachmentOwner(qc, 'note', 'n1')
    invalidateNotasAttachmentOwner(qc, 'task', 't1')
    invalidateNotasAttachmentOwner(qc, 'prompt', 'p1')

    expect(queryKeysFrom(spy)).toEqual([
      queryKeys.notasAttachments('note', 'n1'),
      queryKeys.notes,
      queryKeys.notasFeed,
      queryKeys.notasAttachments('task', 't1'),
      queryKeys.tasks,
      queryKeys.notasAttachments('prompt', 'p1'),
    ])
  })
})
