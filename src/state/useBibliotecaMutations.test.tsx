/**
 * PR4 — hooks de mutación de la Biblioteca: renombrar + eliminar/restaurar.
 * Cubre el optimistic update sobre la cache infinita, el toast "Deshacer" al
 * eliminar (que restaura), y el rollback ante un error de red.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from './offline'
import { ToastProvider, useToast } from './toast'
import { useRenameLibraryItem, useSetLibraryItemDeleted } from './useBiblioteca'
import { queryKeys } from './queryClient'
import * as apiModule from '../api'
import type { LibraryItem } from '../types/biblioteca'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function wrapWith(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <OfflineContext.Provider value={{ offline: false, setOffline: () => {} }}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineContext.Provider>
      </QueryClientProvider>
    )
  }
}

function item(partial: Partial<LibraryItem> & Pick<LibraryItem, 'itemId'>): LibraryItem {
  return {
    id: `notas-attachment:${partial.itemId}`,
    kind: 'notas-attachment',
    title: 'Original.pdf',
    fileType: 'pdf',
    source: 'subido',
    mimeType: 'application/pdf',
    byteSize: 1024,
    storageKey: `legacy/${partial.itemId}`,
    storageDomain: 'notas-attachments',
    tags: [],
    pinned: false,
    aiStatus: null,
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    ...partial,
  }
}

/** Siembra una página de la query infinita para una combinación de filtros. */
function seedList(qc: QueryClient, items: LibraryItem[]) {
  qc.setQueryData(
    [...queryKeys.bibliotecaInfinite, 'todo', '', 'modificado-desc', '', '', 'activos'],
    { pages: [{ items, nextCursor: null }], pageParams: [undefined] },
  )
}

function readItems(qc: QueryClient): LibraryItem[] {
  const data = qc.getQueryData<{ pages: Array<{ items: LibraryItem[] }> }>([
    ...queryKeys.bibliotecaInfinite,
    'todo',
    '',
    'modificado-desc',
    '',
    '',
    'activos',
  ])
  return data?.pages.flatMap((p) => p.items) ?? []
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useRenameLibraryItem', () => {
  it('actualiza el título optimista y llama a la API', async () => {
    const renameSpy = vi
      .spyOn(apiModule.api.biblioteca, 'rename')
      .mockResolvedValue(undefined)
    const qc = makeQueryClient()
    seedList(qc, [item({ itemId: 'a1' })])

    const { result } = renderHook(() => useRenameLibraryItem(), {
      wrapper: wrapWith(qc),
    })

    act(() =>
      result.current.mutate({
        kind: 'notas-attachment',
        itemId: 'a1',
        displayTitle: 'Renombrado.pdf',
      }),
    )

    // Optimista: el título cambia antes de que la promesa resuelva.
    await waitFor(() => expect(readItems(qc)[0]?.title).toBe('Renombrado.pdf'))
    expect(renameSpy).toHaveBeenCalledWith('notas-attachment', 'a1', 'Renombrado.pdf')
  })

  it('revierte el título si la API falla', async () => {
    vi.spyOn(apiModule.api.biblioteca, 'rename').mockRejectedValue(new Error('boom'))
    const qc = makeQueryClient()
    seedList(qc, [item({ itemId: 'a1', title: 'Original.pdf' })])

    const { result } = renderHook(
      () => ({ m: useRenameLibraryItem(), toast: useToast() }),
      { wrapper: wrapWith(qc) },
    )

    act(() =>
      result.current.m.mutate({
        kind: 'notas-attachment',
        itemId: 'a1',
        displayTitle: 'Fallido.pdf',
      }),
    )

    await waitFor(() => expect(result.current.m.isError).toBe(true))
    // Rollback al snapshot previo.
    expect(readItems(qc)[0]?.title).toBe('Original.pdf')
    expect(result.current.toast.current?.tone).toBe('error')
  })
})

describe('useSetLibraryItemDeleted', () => {
  it('elimina optimista, muestra "Deshacer" y restaura al accionarlo', async () => {
    const setDeletedSpy = vi
      .spyOn(apiModule.api.biblioteca, 'setDeleted')
      .mockResolvedValue(undefined)
    const qc = makeQueryClient()
    seedList(qc, [item({ itemId: 'a1' }), item({ itemId: 'a2' })])

    const { result } = renderHook(
      () => ({ m: useSetLibraryItemDeleted(), toast: useToast() }),
      { wrapper: wrapWith(qc) },
    )

    act(() =>
      result.current.m.mutate({ kind: 'notas-attachment', itemId: 'a1', deleted: true }),
    )

    // Optimista: el item desaparece de la lista.
    await waitFor(() => expect(readItems(qc).map((i) => i.itemId)).toEqual(['a2']))
    // Toast con Deshacer.
    await waitFor(() =>
      expect(result.current.toast.current?.action?.label).toBe('Deshacer'),
    )
    expect(result.current.toast.current?.message).toBe('Archivo eliminado')
    expect(setDeletedSpy).toHaveBeenCalledWith('notas-attachment', 'a1', true)

    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })
    // Deshacer = restaurar (deleted=false).
    expect(setDeletedSpy).toHaveBeenCalledWith('notas-attachment', 'a1', false)
  })

  it('restaurar (deleted=false) NO muestra toast de Deshacer', async () => {
    vi.spyOn(apiModule.api.biblioteca, 'setDeleted').mockResolvedValue(undefined)
    const qc = makeQueryClient()
    seedList(qc, [item({ itemId: 'a1' })])

    const { result } = renderHook(
      () => ({ m: useSetLibraryItemDeleted(), toast: useToast() }),
      { wrapper: wrapWith(qc) },
    )

    act(() =>
      result.current.m.mutate({ kind: 'notas-attachment', itemId: 'a1', deleted: false }),
    )
    await waitFor(() => expect(result.current.m.isSuccess).toBe(true))
    expect(result.current.toast.current).toBeNull()
  })
})
