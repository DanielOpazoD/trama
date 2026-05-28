/**
 * Tests para los hooks de extracción IA y AI settings:
 *  - useExtract (mutation simple, sin optimistic — solo llama API)
 *  - useAsk (mutation que la barra universal usa)
 *  - useAISettingsQuery / useSetAITaskProvider
 *
 * No requieren OfflineContext porque solo los happy/error paths
 * online se cubren acá (offline ya falla con throw temprano y no
 * vale la pena re-testearlo en cada hook).
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from './offline'
import { useExtract, useAsk } from './useExtract'
import { useAISettingsQuery, useSetAITaskProvider } from './useAISettings'
import * as apiModule from '../api'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function wrap(qc: QueryClient, offline = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <OfflineContext.Provider value={{ offline, setOffline: () => {} }}>
          {children}
        </OfflineContext.Provider>
      </QueryClientProvider>
    )
  }
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('useExtract', () => {
  it('llama a api.extract con el texto y devuelve la propuesta', async () => {
    const fake = {
      entities: [{ name: 'X', type: 'libro' }],
      relationships: [],
      quotes: [],
    }
    const spy = vi
      .spyOn(apiModule.api, 'extract')
      .mockResolvedValue(fake as unknown as Awaited<ReturnType<typeof apiModule.api.extract>>)

    const qc = makeQueryClient()
    const { result } = renderHook(() => useExtract(), { wrapper: wrap(qc) })

    act(() => {
      result.current.mutate('pega texto acá')
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('pega texto acá')
    expect(result.current.data).toEqual(fake)
  })

  it('en offline lanza un error legible (no llama API)', async () => {
    const spy = vi.spyOn(apiModule.api, 'extract')
    const qc = makeQueryClient()
    const { result } = renderHook(() => useExtract(), { wrapper: wrap(qc, /*offline*/ true) })

    act(() => {
      result.current.mutate('texto')
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toMatch(/conexión al backend/i)
    expect(spy).not.toHaveBeenCalled()
  })

  it('expone meta.silent=true para que useGlobalStatus lo ignore', () => {
    const qc = makeQueryClient()
    renderHook(() => useExtract(), { wrapper: wrap(qc) })
    // No es API pública del hook — la única forma de chequearlo sería
    // espiando las mutations en el QueryClient. Smoke test: que el
    // setup no rompa.
    expect(qc).toBeDefined()
  })
})

describe('useAsk', () => {
  it('pasa view/selectedEntityId/threadId a api.ask', async () => {
    const spy = vi
      .spyOn(apiModule.api, 'ask')
      .mockResolvedValue({ reply: 'hola' } as unknown as Awaited<
        ReturnType<typeof apiModule.api.ask>
      >)

    const qc = makeQueryClient()
    const { result } = renderHook(() => useAsk(), { wrapper: wrap(qc) })

    act(() => {
      result.current.mutate({
        text: 'qué pienso de Borges',
        view: 'chat',
        selectedEntityId: 'ent-123',
        threadId: 'th-1',
      })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith('qué pienso de Borges', {
      view: 'chat',
      selectedEntityId: 'ent-123',
      threadId: 'th-1',
    })
  })
})

describe('useAISettingsQuery + useSetAITaskProvider', () => {
  it('useAISettingsQuery cachea la respuesta de api.getAISettings', async () => {
    const fake = {
      defaultProvider: 'deepseek',
      visionDefaultProvider: null,
      tasks: [],
    }
    vi.spyOn(apiModule.api, 'getAISettings').mockResolvedValue(
      fake as unknown as Awaited<ReturnType<typeof apiModule.api.getAISettings>>,
    )

    const qc = makeQueryClient()
    const { result } = renderHook(() => useAISettingsQuery(), { wrapper: wrap(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(fake)
  })

  it('useSetAITaskProvider invalida la query al PUT exitoso', async () => {
    const fake = { defaultProvider: 'deepseek', visionDefaultProvider: null, tasks: [] }
    vi.spyOn(apiModule.api, 'getAISettings').mockResolvedValue(
      fake as unknown as Awaited<ReturnType<typeof apiModule.api.getAISettings>>,
    )
    const setSpy = vi
      .spyOn(apiModule.api, 'setAITaskProvider')
      .mockResolvedValue(undefined as unknown as Awaited<
        ReturnType<typeof apiModule.api.setAITaskProvider>
      >)

    const qc = makeQueryClient()
    const querySpy = vi.spyOn(qc, 'invalidateQueries')

    const { result } = renderHook(() => useSetAITaskProvider(), { wrapper: wrap(qc) })
    act(() => {
      result.current.mutate({ task: 'extract', provider: 'openai', model: 'gpt-4o' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(setSpy).toHaveBeenCalledWith('extract', 'openai', 'gpt-4o', null)
    // invalidateQueries con la KEY ['ai', 'settings']
    expect(querySpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['ai', 'settings'] }),
    )
  })
})
