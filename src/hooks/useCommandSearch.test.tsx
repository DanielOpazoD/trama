import { type ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCommandSearch, type Item } from './useCommandSearch'

/**
 * Tests del modo unificado: las consultas guardadas afloran como items
 * `savedQuery` y un item `ask` aparece cuando la query tiene ≥3 caracteres.
 */

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const SAVED = {
  items: [
    {
      id: 'sq-1',
      name: 'Filósofos antiguos',
      description: null,
      query: { from: ['entity'], where: { field: 'type', op: 'eq', value: 'persona' } },
      pinned: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ],
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/counts'))
        return jsonResp({ entities: 1, quotes: 0, relationships: 0, momentos: 0 })
      if (url.includes('/api/saved-queries')) return jsonResp(SAVED)
      if (url.includes('/api/search')) return jsonResp({})
      if (url.includes('/api/entities')) return jsonResp([])
      if (url.includes('/api/quotes')) return jsonResp([])
      return jsonResp({})
    }),
  )
})

afterEach(() => vi.unstubAllGlobals())

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function find(items: Item[], kind: Item['kind']) {
  return items.filter((i) => i.kind === kind)
}

describe('useCommandSearch (modo unificado)', () => {
  it('expone consultas guardadas como items savedQuery con query vacía', async () => {
    const { result } = renderHook(
      () => useCommandSearch({ open: true, actionsEnabled: false }),
      { wrapper },
    )
    await waitFor(() => {
      const saved = find(result.current.items, 'savedQuery')
      expect(saved.length).toBe(1)
    })
    const saved = find(result.current.items, 'savedQuery')[0]
    expect(saved).toMatchObject({
      kind: 'savedQuery',
      id: 'sq-1',
      name: 'Filósofos antiguos',
    })
  })

  it('agrega un item ask cuando la query tiene ≥3 caracteres', async () => {
    const { result } = renderHook(
      () => useCommandSearch({ open: true, actionsEnabled: false }),
      { wrapper },
    )
    await waitFor(() => expect(find(result.current.items, 'savedQuery').length).toBe(1))

    // <3 chars: sin item ask.
    result.current.setQuery('ab')
    await waitFor(() => expect(find(result.current.items, 'ask').length).toBe(0))

    // ≥3 chars: un item ask al final con la query trimmeada.
    result.current.setQuery('borges argentino')
    await waitFor(() => {
      const ask = find(result.current.items, 'ask')
      expect(ask.length).toBe(1)
      expect(ask[0]).toMatchObject({ kind: 'ask', q: 'borges argentino' })
    })
    // El item ask va al final de la lista.
    const items = result.current.items
    expect(items[items.length - 1]?.kind).toBe('ask')
  })
})
