import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../api'
import * as apiModule from '../api'
import { queryKeys } from './queryClient'
import { ToastProvider, useToast } from './toast'
import { useCreateTask, useDeleteTask, useUpdateTask } from './useTasks'

const TASK: Task = {
  id: 't1',
  title: 'Preparar pauta',
  detail: 'Notas para la semana',
  done: false,
  dueDate: '2026-06-24',
  priority: 'media',
  weekStart: '2026-06-22',
  category: 'trabajo',
  completedAt: null,
  hasPhotos: false,
  origin: { kind: 'manual' },
  tags: ['pauta'],
  createdAt: '2026-06-23T10:00:00.000Z',
  updatedAt: '2026-06-23T10:00:00.000Z',
}

const OTHER_TASK: Task = {
  ...TASK,
  id: 't2',
  title: 'Comprar café',
  category: 'personal',
}

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
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    )
  }
}

function seedTaskVariants(qc: QueryClient) {
  qc.setQueryData<Task[]>(queryKeys.tasks, [TASK, OTHER_TASK])
  qc.setQueryData<Task[]>(queryKeys.tasksRange('2026-06-22', '2026-06-28', null), [TASK])
  qc.setQueryData<Task[]>(queryKeys.tasksPending, [TASK, OTHER_TASK])
}

function taskVariants(qc: QueryClient) {
  return {
    all: qc.getQueryData<Task[]>(queryKeys.tasks),
    range: qc.getQueryData<Task[]>(
      queryKeys.tasksRange('2026-06-22', '2026-06-28', null),
    ),
    pending: qc.getQueryData<Task[]>(queryKeys.tasksPending),
  }
}

function invalidatedKeys(qc: QueryClient) {
  return vi
    .spyOn(qc, 'invalidateQueries')
    .mockImplementation(() => Promise.resolve(undefined))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTasks mutation cache contracts', () => {
  it('useUpdateTask parchea todas las variantes y restaura el snapshot exacto si falla', async () => {
    let rejectServer: (err: Error) => void = () => {}
    vi.spyOn(apiModule.api.tasks, 'update').mockReturnValue(
      new Promise<Task>((_resolve, reject) => {
        rejectServer = reject
      }),
    )
    const qc = makeQueryClient()
    seedTaskVariants(qc)
    const before = taskVariants(qc)

    const { result } = renderHook(() => useUpdateTask(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate({ id: 't1', patch: { title: 'Pauta editada' } })
    })

    await waitFor(() => {
      expect(taskVariants(qc).all?.[0]?.title).toBe('Pauta editada')
      expect(taskVariants(qc).range?.[0]?.title).toBe('Pauta editada')
      expect(taskVariants(qc).pending?.[0]?.title).toBe('Pauta editada')
    })
    act(() => rejectServer(new Error('boom')))
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(taskVariants(qc)).toEqual(before)
  })

  it('useDeleteTask filtra todas las variantes y restaura el snapshot exacto si falla', async () => {
    let rejectServer: (err: Error) => void = () => {}
    vi.spyOn(apiModule.api.tasks, 'remove').mockReturnValue(
      new Promise<{ deletedAt: string | null }>((_resolve, reject) => {
        rejectServer = reject
      }),
    )
    const qc = makeQueryClient()
    seedTaskVariants(qc)
    const before = taskVariants(qc)

    const { result } = renderHook(() => useDeleteTask(), { wrapper: wrapWith(qc) })
    act(() => {
      result.current.mutate('t1')
    })

    await waitFor(() => {
      expect(taskVariants(qc).all?.map((t) => t.id)).toEqual(['t2'])
      expect(taskVariants(qc).range).toEqual([])
      expect(taskVariants(qc).pending?.map((t) => t.id)).toEqual(['t2'])
    })
    act(() => rejectServer(new Error('boom')))
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(taskVariants(qc)).toEqual(before)
  })

  it('create/delete/undo invalidan tasks, cronologia e inicio desde el helper compartido', async () => {
    vi.spyOn(apiModule.api.tasks, 'create').mockResolvedValue(TASK)
    vi.spyOn(apiModule.api.tasks, 'remove').mockResolvedValue({
      deletedAt: '2026-06-23T12:00:00.000Z',
    })
    vi.spyOn(apiModule.api.tasks, 'restore').mockResolvedValue(undefined)
    const qc = makeQueryClient()
    seedTaskVariants(qc)
    const invalidateSpy = invalidatedKeys(qc)

    const { result } = renderHook(
      () => ({
        create: useCreateTask(),
        del: useDeleteTask(),
        toast: useToast(),
      }),
      { wrapper: wrapWith(qc) },
    )

    await act(async () => {
      await result.current.create.mutateAsync({ title: 'Nueva' })
      await result.current.del.mutateAsync('t1')
    })
    await waitFor(() => expect(result.current.toast.current).not.toBeNull())
    await act(async () => {
      await result.current.toast.current!.action!.onAction()
    })

    expect(invalidateSpy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.tasks,
      queryKeys.cronologiaInfinite,
      queryKeys.home,
      queryKeys.tasks,
      queryKeys.cronologiaInfinite,
      queryKeys.home,
      queryKeys.tasks,
      queryKeys.cronologiaInfinite,
      queryKeys.home,
    ])
  })
})
