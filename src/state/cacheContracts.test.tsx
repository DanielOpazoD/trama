import type { InfiniteData } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Note, Recorte } from '../api'
import type { NotasFeedPage } from '../api/notasFeed'
import * as apiModule from '../api'
import { makeQueryClient } from '../test-utils'
import { queryKeys } from './queryClient'
import { ToastProvider, useToast } from './toast'
import { useDeleteNote, usePromoteNote, useUpdateNote } from './useNotes'
import { useDeleteNotasAttachment, useUploadNotasAttachment } from './useNotasAttachments'
import { useDeleteMomento } from './useMomentos'
import {
  useDeleteRecorte,
  usePromoteRecorte,
  useUnpromoteRecorte,
  useUpdateRecorte,
} from './useRecortes'

const DELETED_AT = '2026-06-10T12:00:00.000Z'
const FEED_KEY = queryKeys.notasFeedFiltered('contract')

function wrapWith(qc: ReturnType<typeof makeQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    )
  }
}

function invalidatedKeys(qc: ReturnType<typeof makeQueryClient>) {
  return vi
    .spyOn(qc, 'invalidateQueries')
    .mockImplementation(() => Promise.resolve(undefined))
}

function keysFrom(spy: ReturnType<typeof invalidatedKeys>) {
  return spy.mock.calls.map(([filters]) => filters?.queryKey)
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    content: 'nota',
    title: 'Nota',
    tags: [],
    pinned: false,
    promotedMomentoId: null,
    source: null,
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-06-10T12:00:00.000Z',
    hasImages: false,
    hasAudio: false,
    ...overrides,
  }
}

function recorte(overrides: Partial<Recorte> = {}): Recorte {
  return {
    id: 'r1',
    text: 'recorte',
    sourceUrl: null,
    sourceTitle: null,
    sourceAuthor: null,
    note: null,
    imageUrl: null,
    imageKey: null,
    images: [],
    captureMode: 'html',
    status: 'pending',
    promotedTarget: null,
    promotedId: null,
    captureSource: null,
    capturedAt: null,
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-06-10T12:00:00.000Z',
    ...overrides,
  }
}

function feedWithNote(n: Note): InfiniteData<NotasFeedPage> {
  return {
    pageParams: [null],
    pages: [
      {
        items: [{ type: 'note', id: n.id, createdAt: n.createdAt, note: n }],
        nextCursor: null,
      },
    ],
  }
}

function feedWithRecorte(r: Recorte): InfiniteData<NotasFeedPage> {
  return {
    pageParams: [null],
    pages: [
      {
        items: [{ type: 'recorte', id: r.id, createdAt: r.createdAt, recorte: r }],
        nextCursor: null,
      },
    ],
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('state cache contracts', () => {
  it('nota: delete + undo invalidan notes y notasFeed en ambos pasos', async () => {
    vi.spyOn(apiModule.api.notes, 'remove').mockResolvedValue({ deletedAt: DELETED_AT })
    vi.spyOn(apiModule.api.notes, 'restore').mockResolvedValue(undefined)
    const qc = makeQueryClient()
    const invalidateSpy = invalidatedKeys(qc)
    const { result } = renderHook(() => ({ del: useDeleteNote(), toast: useToast() }), {
      wrapper: wrapWith(qc),
    })

    await act(async () => {
      await result.current.del.mutateAsync('n1')
    })
    await waitFor(() => expect(result.current.toast.current).not.toBeNull())

    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })

    expect(keysFrom(invalidateSpy)).toEqual([
      queryKeys.notes,
      queryKeys.notasFeed,
      queryKeys.notes,
      queryKeys.notasFeed,
    ])
  })

  it('nota: rollback optimista restaura notes y notasFeed si update falla', async () => {
    vi.spyOn(apiModule.api.notes, 'update').mockRejectedValue(new Error('boom'))
    const qc = makeQueryClient()
    const previous = note({ title: 'Antes', pinned: false })
    qc.setQueryData(queryKeys.notes, [previous])
    qc.setQueryData(FEED_KEY, feedWithNote(previous))
    const { result } = renderHook(() => useUpdateNote(), { wrapper: wrapWith(qc) })

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          id: 'n1',
          patch: { title: 'Después', pinned: true },
        }),
      ).rejects.toThrow('boom')
    })

    expect(qc.getQueryData(queryKeys.notes)).toEqual([previous])
    expect(qc.getQueryData(FEED_KEY)).toEqual(feedWithNote(previous))
  })

  it('nota: promote invalida notas, feed y superficies de momento', async () => {
    vi.spyOn(apiModule.api.notes, 'promote').mockResolvedValue({ momentoId: 'm1' })
    const qc = makeQueryClient()
    const invalidateSpy = invalidatedKeys(qc)
    const { result } = renderHook(() => usePromoteNote(), { wrapper: wrapWith(qc) })

    await act(async () => {
      await result.current.mutateAsync('n1')
    })

    expect(keysFrom(invalidateSpy)).toEqual([
      queryKeys.notes,
      queryKeys.notasFeed,
      queryKeys.momentosInfinite,
      queryKeys.cronologiaInfinite,
      queryKeys.home,
    ])
  })

  it('recorte: delete + undo invalidan recortes y notasFeed en ambos pasos', async () => {
    vi.spyOn(apiModule.api, 'removeRecorte').mockResolvedValue({ deletedAt: DELETED_AT })
    vi.spyOn(apiModule.api, 'restoreRecorte').mockResolvedValue(undefined)
    const qc = makeQueryClient()
    const invalidateSpy = invalidatedKeys(qc)
    const { result } = renderHook(
      () => ({ del: useDeleteRecorte(), toast: useToast() }),
      {
        wrapper: wrapWith(qc),
      },
    )

    await act(async () => {
      await result.current.del.mutateAsync('r1')
    })
    await waitFor(() => expect(result.current.toast.current).not.toBeNull())

    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })

    expect(keysFrom(invalidateSpy)).toEqual([
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.recortes,
      queryKeys.notasFeed,
    ])
  })

  it('recorte: promote a quote invalida destino y superficies derivadas', async () => {
    vi.spyOn(apiModule.api, 'promoteRecorte').mockResolvedValue(
      recorte({ status: 'promoted', promotedTarget: 'quote', promotedId: 'q1' }),
    )
    const qc = makeQueryClient()
    const invalidateSpy = invalidatedKeys(qc)
    const { result } = renderHook(() => usePromoteRecorte(), { wrapper: wrapWith(qc) })

    await act(async () => {
      await result.current.mutateAsync({
        id: 'r1',
        input: {
          target: 'quote',
          quote: { entityId: 'e1', text: 'recorte' },
        },
      })
    })

    expect(keysFrom(invalidateSpy)).toEqual([
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.quotes,
      queryKeys.quotesInfinite,
      queryKeys.counts,
      queryKeys.home,
    ])
  })

  it('recorte: unpromote invalida origen y destinos posibles', async () => {
    vi.spyOn(apiModule.api, 'unpromoteRecorte').mockResolvedValue(
      recorte({ status: 'pending', promotedTarget: null, promotedId: null }),
    )
    const qc = makeQueryClient()
    const invalidateSpy = invalidatedKeys(qc)
    const { result } = renderHook(() => useUnpromoteRecorte(), { wrapper: wrapWith(qc) })

    await act(async () => {
      await result.current.mutateAsync('r1')
    })

    expect(keysFrom(invalidateSpy)).toEqual([
      queryKeys.recortes,
      queryKeys.notasFeed,
      queryKeys.quotes,
      queryKeys.quotesInfinite,
      queryKeys.entities,
      queryKeys.momentosInfinite,
      queryKeys.counts,
      queryKeys.home,
    ])
  })

  it('recorte: rollback optimista restaura recortes y notasFeed si update falla', async () => {
    vi.spyOn(apiModule.api, 'updateRecorte').mockRejectedValue(new Error('boom'))
    const qc = makeQueryClient()
    const previous = recorte({ status: 'pending' })
    qc.setQueryData(queryKeys.recortes, [previous])
    qc.setQueryData(FEED_KEY, feedWithRecorte(previous))
    const { result } = renderHook(() => useUpdateRecorte(), { wrapper: wrapWith(qc) })

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: 'r1', patch: { status: 'archived' } }),
      ).rejects.toThrow('boom')
    })

    expect(qc.getQueryData(queryKeys.recortes)).toEqual([previous])
    expect(qc.getQueryData(FEED_KEY)).toEqual(feedWithRecorte(previous))
  })

  it('momento: delete + undo invalidan timeline, home, cronologia y atlas', async () => {
    vi.spyOn(apiModule.api, 'deleteMomento').mockResolvedValue({ deletedAt: DELETED_AT })
    vi.spyOn(apiModule.api, 'restoreMomento').mockResolvedValue(
      {} as Awaited<ReturnType<typeof apiModule.api.restoreMomento>>,
    )
    const qc = makeQueryClient()
    const invalidateSpy = invalidatedKeys(qc)
    const { result } = renderHook(
      () => ({ del: useDeleteMomento(), toast: useToast() }),
      { wrapper: wrapWith(qc) },
    )

    await act(async () => {
      await result.current.del.mutateAsync('m1')
    })
    await waitFor(() => expect(result.current.toast.current).not.toBeNull())

    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })

    expect(keysFrom(invalidateSpy)).toEqual([
      queryKeys.momentosInfinite,
      queryKeys.home,
      queryKeys.cronologiaInfinite,
      queryKeys.atlas,
      queryKeys.momentosInfinite,
      queryKeys.home,
      queryKeys.cronologiaInfinite,
      queryKeys.atlas,
    ])
  })

  it('attachments: note refresca anexos, notes y notasFeed; task refresca tareas', async () => {
    vi.spyOn(apiModule.api.notasAttachments, 'upload').mockResolvedValue({
      id: 'att-1',
      ownerType: 'note',
      ownerId: 'n1',
      fileName: 'foto.webp',
      mimeType: 'image/webp',
      byteSize: 10,
      storageKey: 'u/foto.webp',
      url: '/api/notas-attachments-file/u/foto.webp',
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:00:00.000Z',
    })
    vi.spyOn(apiModule.api.notasAttachments, 'remove').mockResolvedValue(undefined)
    const qc = makeQueryClient()
    const invalidateSpy = invalidatedKeys(qc)
    const { result } = renderHook(
      () => ({ upload: useUploadNotasAttachment(), remove: useDeleteNotasAttachment() }),
      { wrapper: wrapWith(qc) },
    )

    await act(async () => {
      await result.current.upload.mutateAsync({
        ownerType: 'note',
        ownerId: 'n1',
        file: new File(['x'], 'foto.webp', { type: 'image/webp' }),
      })
      await result.current.remove.mutateAsync({
        id: 'att-2',
        ownerType: 'task',
        ownerId: 't1',
      })
      await result.current.remove.mutateAsync({
        id: 'att-3',
        ownerType: 'note',
        ownerId: 'n1',
      })
    })

    expect(keysFrom(invalidateSpy)).toEqual([
      queryKeys.notasAttachments('note', 'n1'),
      queryKeys.notes,
      queryKeys.notasFeed,
      queryKeys.notasAttachments('task', 't1'),
      queryKeys.tasks,
      queryKeys.notasAttachments('note', 'n1'),
      queryKeys.notes,
      queryKeys.notasFeed,
    ])
  })
})
