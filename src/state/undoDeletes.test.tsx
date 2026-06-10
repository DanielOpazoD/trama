/**
 * Ola transversal 2026-06 — deshacer global: el toast "Deshacer" de los
 * dominios que lo estrenan (notas, tareas, prompts, momentos), espejo del
 * test ya existente de entidades en useEntities.test.tsx. Cubre el ciclo
 * completo: delete → toast con acción → onAction llama al restore con el
 * deletedAt EXACTO que devolvió el DELETE.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from './offline'
import { ToastProvider, useToast } from './toast'
import { useDeleteNote } from './useNotes'
import { useDeleteTask } from './useTasks'
import { useDeletePrompt } from './usePrompts'
import { useDeleteMomento } from './useMomentos'
import * as apiModule from '../api'

const DELETED_AT = '2026-06-10T12:00:00Z'

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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('deshacer global — notas/tareas/prompts/momentos', () => {
  it('nota: delete → toast Deshacer → restore con el deletedAt exacto', async () => {
    vi.spyOn(apiModule.api.notes, 'remove').mockResolvedValue({
      deletedAt: DELETED_AT,
    })
    const restoreSpy = vi
      .spyOn(apiModule.api.notes, 'restore')
      .mockResolvedValue(undefined)

    const { result } = renderHook(() => ({ del: useDeleteNote(), toast: useToast() }), {
      wrapper: wrapWith(makeQueryClient()),
    })
    act(() => result.current.del.mutate('n1'))
    await waitFor(() => expect(result.current.toast.current).not.toBeNull())
    expect(result.current.toast.current!.message).toBe('Nota eliminada')
    expect(result.current.toast.current!.action?.label).toBe('Deshacer')

    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })
    expect(restoreSpy).toHaveBeenCalledWith('n1', DELETED_AT)
  })

  it('nota: sin deletedAt (offline/demo viejo) NO muestra toast', async () => {
    vi.spyOn(apiModule.api.notes, 'remove').mockResolvedValue({ deletedAt: null })
    const { result } = renderHook(() => ({ del: useDeleteNote(), toast: useToast() }), {
      wrapper: wrapWith(makeQueryClient()),
    })
    act(() => result.current.del.mutate('n1'))
    await waitFor(() => expect(result.current.del.isSuccess).toBe(true))
    expect(result.current.toast.current).toBeNull()
  })

  it('tarea: delete → toast Deshacer → restore', async () => {
    vi.spyOn(apiModule.api.tasks, 'remove').mockResolvedValue({
      deletedAt: DELETED_AT,
    })
    const restoreSpy = vi
      .spyOn(apiModule.api.tasks, 'restore')
      .mockResolvedValue(undefined)
    const { result } = renderHook(() => ({ del: useDeleteTask(), toast: useToast() }), {
      wrapper: wrapWith(makeQueryClient()),
    })
    act(() => result.current.del.mutate('t1'))
    await waitFor(() => expect(result.current.toast.current).not.toBeNull())
    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })
    expect(restoreSpy).toHaveBeenCalledWith('t1', DELETED_AT)
  })

  it('prompt: delete → toast Deshacer → restore', async () => {
    vi.spyOn(apiModule.api.prompts, 'remove').mockResolvedValue({
      deletedAt: DELETED_AT,
    })
    const restoreSpy = vi
      .spyOn(apiModule.api.prompts, 'restore')
      .mockResolvedValue(undefined)
    const { result } = renderHook(() => ({ del: useDeletePrompt(), toast: useToast() }), {
      wrapper: wrapWith(makeQueryClient()),
    })
    act(() => result.current.del.mutate('p1'))
    await waitFor(() => expect(result.current.toast.current).not.toBeNull())
    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })
    expect(restoreSpy).toHaveBeenCalledWith('p1', DELETED_AT)
  })

  it('momento: delete → toast Deshacer → restoreMomento', async () => {
    vi.spyOn(apiModule.api, 'deleteMomento').mockResolvedValue({
      deletedAt: DELETED_AT,
    })
    const restoreSpy = vi
      .spyOn(apiModule.api, 'restoreMomento')
      .mockResolvedValue({} as Awaited<ReturnType<typeof apiModule.api.restoreMomento>>)
    const { result } = renderHook(
      () => ({ del: useDeleteMomento(), toast: useToast() }),
      { wrapper: wrapWith(makeQueryClient()) },
    )
    act(() => result.current.del.mutate('m1'))
    await waitFor(() => expect(result.current.toast.current).not.toBeNull())
    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })
    expect(restoreSpy).toHaveBeenCalledWith('m1', DELETED_AT)
  })
})
