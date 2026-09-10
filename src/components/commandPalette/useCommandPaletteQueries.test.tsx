import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NlQueryResult, QueryHit } from '../../api/query'
import { useCommandPaletteQueries } from './useCommandPaletteQueries'

const m = vi.hoisted(() => ({
  ask: vi.fn(),
  run: vi.fn(),
  save: vi.fn(),
  toast: vi.fn(),
  hidden: new Set<string>(),
}))

vi.mock('../../state/useSavedQueries', () => ({
  useAskQuery: () => ({ mutateAsync: m.ask }),
  useRunQuery: () => ({ mutateAsync: m.run }),
  useSaveQuery: () => ({ mutateAsync: m.save, isPending: false }),
}))
vi.mock('../../state/toast', () => ({ useToast: () => ({ show: m.toast }) }))
vi.mock('../../hooks/useSectionPin', () => ({
  useSectionPin: () => ({ isContentHidden: (id: string) => m.hidden.has(id) }),
}))

function respuesta(title: string): NlQueryResult {
  return {
    items: [
      {
        kind: 'entity',
        id: title,
        title,
        snippet: null,
        createdAt: '2026-01-01',
        tags: [],
      },
    ],
    nextCursor: null,
    query: { from: ['entity'] },
    source: 'llm',
  }
}

function diferida<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function conNota(): NlQueryResult {
  const base = respuesta('Borges')
  const nota: QueryHit = {
    kind: 'note',
    id: 'n-1',
    title: null,
    snippet: 'comprar pan',
    createdAt: '2026-01-01',
    tags: [],
  }
  return { ...base, items: [...base.items, nota] }
}

const tiposDe = (call: unknown[] | undefined) =>
  (call?.[0] as { hits: QueryHit[] }).hits.map((hit) => hit.kind)

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  vi.clearAllMocks()
  m.hidden.clear()
})

describe('useCommandPaletteQueries', () => {
  it('descarta la respuesta de una pregunta que quedó vieja', async () => {
    const primera = diferida<NlQueryResult>()
    const segunda = diferida<NlQueryResult>()
    m.ask.mockReturnValueOnce(primera.promise).mockReturnValueOnce(segunda.promise)
    const onResults = vi.fn()
    const { result } = renderHook(() =>
      useCommandPaletteQueries({ query: 'x', onResults }),
    )

    act(() => result.current.runAsk('primera'))
    act(() => result.current.runAsk('segunda'))
    primera.resolve(respuesta('primera'))
    segunda.resolve(respuesta('segunda'))

    await waitFor(() => expect(onResults).toHaveBeenCalled())
    await act(tick)
    expect(onResults).toHaveBeenCalledTimes(1)
    expect(onResults.mock.calls[0]?.[0]).toMatchObject({ heading: '«segunda»' })
    expect(result.current.running).toBe(false)
  })

  it('cambiar la búsqueda invalida la consulta en curso', async () => {
    const pendiente = diferida<NlQueryResult>()
    m.ask.mockReturnValueOnce(pendiente.promise)
    const onResults = vi.fn()
    const { result, rerender } = renderHook(
      ({ query }) => useCommandPaletteQueries({ query, onResults }),
      { initialProps: { query: 'uno' } },
    )

    act(() => result.current.runAsk('uno'))
    expect(result.current.running).toBe(true)
    rerender({ query: 'uno más' })
    pendiente.resolve(respuesta('uno'))
    await act(tick)

    expect(onResults).not.toHaveBeenCalled()
    expect(result.current.running).toBe(false)
  })

  it('una respuesta sin items avisa en vez de pintar resultados rotos', async () => {
    m.ask.mockResolvedValueOnce({ ok: true })
    const onResults = vi.fn()
    const { result } = renderHook(() =>
      useCommandPaletteQueries({ query: 'x', onResults }),
    )

    act(() => result.current.runAsk('x'))

    await waitFor(() =>
      expect(m.toast).toHaveBeenCalledWith({
        message: 'No se pudo interpretar la pregunta.',
        tone: 'error',
      }),
    )
    expect(onResults).not.toHaveBeenCalled()
  })

  it('con Notas protegida, una pregunta no enseña notas; sin PIN, sí', async () => {
    m.hidden.add('notas:notas')
    m.ask.mockResolvedValue(conNota())
    const onResults = vi.fn()
    const { result, rerender } = renderHook(() =>
      useCommandPaletteQueries({ query: 'x', onResults }),
    )

    act(() => result.current.runAsk('pan'))
    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(1))
    expect(tiposDe(onResults.mock.calls[0])).toEqual(['entity'])

    m.hidden.clear()
    rerender()
    act(() => result.current.runAsk('pan'))
    await waitFor(() => expect(onResults).toHaveBeenCalledTimes(2))
    expect(tiposDe(onResults.mock.calls[1])).toEqual(['entity', 'note'])
  })

  it('una consulta guardada tampoco enseña notas protegidas', async () => {
    m.hidden.add('notas:notas')
    m.run.mockResolvedValueOnce({ items: conNota().items, nextCursor: null })
    const onResults = vi.fn()
    const { result } = renderHook(() =>
      useCommandPaletteQueries({ query: 'x', onResults }),
    )

    act(() => result.current.runAst({ from: ['note'] }, 'Guardada', 'sq-1'))
    await waitFor(() => expect(onResults).toHaveBeenCalled())
    expect(onResults.mock.calls[0]?.[0]).toMatchObject({
      heading: 'Guardada',
      savedQueryId: 'sq-1',
    })
    expect(tiposDe(onResults.mock.calls[0])).toEqual(['entity'])
  })

  it('guardar resuelve si se guardó, y un fallo no se propaga', async () => {
    m.save.mockResolvedValueOnce({ id: 'sq-1' }).mockRejectedValueOnce(new Error('500'))
    const { result } = renderHook(() =>
      useCommandPaletteQueries({ query: '', onResults: vi.fn() }),
    )

    await expect(result.current.saveQuery('A', { from: ['entity'] })).resolves.toBe(true)
    await expect(result.current.saveQuery('B', { from: ['entity'] })).resolves.toBe(false)
  })
})
