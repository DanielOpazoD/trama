import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSaveQuery } from './useSavedQueries'

const toast = vi.hoisted(() => ({ show: vi.fn() }))
vi.mock('./toast', () => ({ useToast: () => toast }))

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

afterEach(() => {
  vi.unstubAllGlobals()
  toast.show.mockClear()
})

describe('useSaveQuery', () => {
  it('un fallo al guardar avisa: antes pasaba en silencio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }), {
            status: 500,
          }),
      ),
    )
    const { result } = renderHook(() => useSaveQuery(), { wrapper })

    await expect(
      result.current.mutateAsync({ name: 'A', query: { from: ['entity'] } }),
    ).rejects.toBeTruthy()
    await waitFor(() =>
      expect(toast.show).toHaveBeenCalledWith({
        message: 'No se pudo guardar la consulta.',
        tone: 'error',
      }),
    )
  })
})
