import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../state/toast'
import { makeQueryClient } from '../../../test-utils'
import { useNotasOmniboxItems } from './useNotasOmniboxItems'

const m = vi.hoisted(() => ({ hidden: new Set<string>() }))

vi.mock('../../../hooks/useSectionPin', () => ({
  useSectionPin: () => ({
    isContentHidden: (id: string) => m.hidden.has('*') || m.hidden.has(id),
  }),
}))

const FECHA = '2026-09-01T10:00:00.000Z'
const NOTE_ROW = {
  id: 'n1',
  content: 'Comprar tinta y papel',
  title: null,
  tags: [],
  pinned: false,
  promoted_momento_id: null,
  created_at: FECHA,
  updated_at: FECHA,
}
const TASK_ROW = {
  id: 't1',
  title: 'Comprar tinta',
  detail: null,
  done: false,
  due_date: null,
  priority: 'media',
  week_start: '2026-08-31',
  category: 'trabajo',
  completed_at: null,
  has_photos: false,
  origin: null,
  tags: [],
  created_at: FECHA,
  updated_at: FECHA,
}
const PROMPT_ROW = {
  id: 'p1',
  title: 'Tinta y papel',
  content: 'Lee {{texto}}',
  collection: null,
  tags: [],
  variables: [],
  favorite: false,
  use_count: 0,
  last_used_at: null,
  created_at: FECHA,
  updated_at: FECHA,
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const ruta = (url: unknown) => new URL(String(url), 'http://localhost').pathname

let fetchMock: ReturnType<typeof vi.fn>

function llamadas(method: string, path: string) {
  return fetchMock.mock.calls.filter(
    ([url, init]) =>
      ruta(url) === path &&
      ((init as RequestInit | undefined)?.method ?? 'GET') === method,
  )
}

function montar(text: string, queryClient: QueryClient = makeQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
  return renderHook(
    (props: { text: string }) => useNotasOmniboxItems({ open: true, ...props }),
    {
      initialProps: { text },
      wrapper,
    },
  )
}

beforeEach(() => {
  m.hidden.clear()
  fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    const method = init?.method ?? 'GET'
    const path = ruta(url)
    if (method === 'GET' && path === '/api/notes') return json([NOTE_ROW])
    if (method === 'GET' && path === '/api/tasks') return json([TASK_ROW])
    if (method === 'GET' && path === '/api/prompts') return json([PROMPT_ROW])
    if (method === 'PATCH' && path === '/api/tasks/t1')
      return json({ ...TASK_ROW, done: true })
    if (method === 'POST' && path === '/api/prompts/p1/use')
      return json({ ...PROMPT_ROW, use_count: 1 })
    return json({})
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
})

describe('useNotasOmniboxItems', () => {
  it('con un carácter no pide nada; con dos, pide las tres listas', async () => {
    const { rerender } = montar('t')
    await act(tick)
    expect(fetchMock).not.toHaveBeenCalled()

    rerender({ text: 'ti' })
    await waitFor(() => expect(llamadas('GET', '/api/tasks')).toHaveLength(1))
    expect(llamadas('GET', '/api/notes')).toHaveLength(1)
    expect(llamadas('GET', '/api/prompts')).toHaveLength(1)
  })

  it('con Notas protegida no pide las notas, y sí las tareas', async () => {
    m.hidden.add('notas:notas')
    const { result } = montar('tinta')
    await waitFor(() =>
      expect(result.current.map((item) => item.id)).toContain('task:t1'),
    )
    expect(llamadas('GET', '/api/notes')).toHaveLength(0)
    expect(result.current.some((item) => item.icon === 'note')).toBe(false)
  })

  it('mientras no lleguen las preferencias, no pide nada ni enseña nada', async () => {
    m.hidden.add('*')
    const { result } = montar('tinta')
    await act(tick)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current).toEqual([])
  })

  it('con la caché de notas llena y Notas protegida, no enseña notas', async () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(
      ['notes'],
      [
        {
          id: 'n1',
          content: 'Comprar tinta y papel',
          title: null,
          tags: [],
          pinned: false,
          promotedMomentoId: null,
          source: null,
          createdAt: FECHA,
          updatedAt: FECHA,
          hasImages: false,
          hasAudio: false,
        },
      ],
    )
    m.hidden.add('notas:notas')
    const { result } = montar('tinta', queryClient)
    await waitFor(() =>
      expect(result.current.map((item) => item.id)).toContain('prompt:p1'),
    )
    expect(result.current.some((item) => item.id === 'note:n1')).toBe(false)
  })

  it('«hecha» manda el PATCH de la tarea con done', async () => {
    const { result } = montar('tinta')
    await waitFor(() =>
      expect(result.current.find((item) => item.id === 'task:t1')).toBeDefined(),
    )
    act(() => result.current.find((item) => item.id === 'task:t1')?.secondary?.run())
    await waitFor(() => expect(llamadas('PATCH', '/api/tasks/t1')).toHaveLength(1))
    const [, init] = llamadas('PATCH', '/api/tasks/t1')[0]!
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ done: true })
  })

  it('«copiar» marca el prompt como usado solo si la copia llegó al portapapeles', async () => {
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denegado'))
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const { result } = montar('tinta')
    await waitFor(() =>
      expect(result.current.find((item) => item.id === 'prompt:p1')).toBeDefined(),
    )
    const copiar = () =>
      result.current.find((item) => item.id === 'prompt:p1')?.secondary?.run()

    act(copiar)
    await waitFor(() => expect(llamadas('POST', '/api/prompts/p1/use')).toHaveLength(1))
    expect(writeText).toHaveBeenCalledWith('Lee {{texto}}')

    act(copiar)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    await act(tick)
    expect(llamadas('POST', '/api/prompts/p1/use')).toHaveLength(1)
  })
})
