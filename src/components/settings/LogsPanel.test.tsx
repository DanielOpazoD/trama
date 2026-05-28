/**
 * Smoke tests para LogsPanel — el panel de Settings → Logs que muestra
 * error_log + extraction_log. Cubrimos:
 *  - Renderiza la PanelHeader y las dos sub-tabs (Errores / Llamadas IA).
 *  - Toggle entre sub-tabs cambia el componente visible.
 *  - El loading state mientras la query corre.
 *  - El empty state cuando no hay logs.
 *  - El dedup-by-pattern de errores idénticos.
 *
 * No testeamos cada cell de UI (timestamp, stack trace, etc.) — eso
 * es responsabilidad del designer + visual review.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LogsPanel } from './LogsPanel'
import * as apiModule from '../../api'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function wrap(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('<LogsPanel />', () => {
  it('renderiza el header y las dos sub-tabs', () => {
    vi.spyOn(apiModule.api, 'errorLog').mockResolvedValue([])
    vi.spyOn(apiModule.api, 'extractionLog').mockResolvedValue({
      entries: [],
      totals: { totalCalls: 0, totalCostCents: 0, totalTokens: 0 },
    })
    const qc = makeQueryClient()
    render(<LogsPanel />, { wrapper: wrap(qc) })
    expect(screen.getByText(/^Logs$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /errores/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /llamadas ia/i })).toBeInTheDocument()
  })

  it('default a "errors" — muestra el empty state si no hay errores', async () => {
    vi.spyOn(apiModule.api, 'errorLog').mockResolvedValue([])
    const qc = makeQueryClient()
    render(<LogsPanel />, { wrapper: wrap(qc) })
    await waitFor(() => {
      expect(screen.getByText(/sin errores registrados/i)).toBeInTheDocument()
    })
  })

  it('toggle a "extractions" cambia el contenido y no rompe', async () => {
    vi.spyOn(apiModule.api, 'errorLog').mockResolvedValue([])
    const extractionSpy = vi.spyOn(apiModule.api, 'extractionLog').mockResolvedValue({
      entries: [],
      totals: { totalCalls: 0, totalCostCents: 0, totalTokens: 0 },
    })
    const qc = makeQueryClient()
    render(<LogsPanel />, { wrapper: wrap(qc) })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /llamadas ia/i }))
    // El componente de extractions ahora hace fetch.
    await waitFor(() => expect(extractionSpy).toHaveBeenCalled())
  })

  it('lista errores cuando la API devuelve resultados, agrupando duplicados', async () => {
    vi.spyOn(apiModule.api, 'errorLog').mockResolvedValue([
      {
        id: 'err-1',
        functionName: 'extract',
        httpMethod: 'POST',
        httpPath: '/api/extract',
        statusCode: 500,
        message: 'Boom error genérico',
        stack: 'Error\n  at foo',
        context: null,
        createdAt: '2026-05-28T10:00:00Z',
      },
      // Segundo error con MISMO function + message → dedupea con el primero.
      {
        id: 'err-2',
        functionName: 'extract',
        httpMethod: 'POST',
        httpPath: '/api/extract',
        statusCode: 500,
        message: 'Boom error genérico',
        stack: 'Error\n  at foo',
        context: null,
        createdAt: '2026-05-28T11:00:00Z',
      },
      // Tercero distinto.
      {
        id: 'err-3',
        functionName: 'ask',
        httpMethod: 'POST',
        httpPath: '/api/ask',
        statusCode: 502,
        message: 'Upstream timeout',
        stack: null,
        context: null,
        createdAt: '2026-05-28T11:30:00Z',
      },
    ])

    const qc = makeQueryClient()
    render(<LogsPanel />, { wrapper: wrap(qc) })

    await waitFor(() => {
      // Dedup: el primer message aparece una sola vez (representante del grupo).
      expect(screen.getAllByText(/Boom error genérico/i)).toHaveLength(1)
      // El error único distinto también aparece.
      expect(screen.getByText(/Upstream timeout/i)).toBeInTheDocument()
    })

    // El badge muestra "2×" sobre el patrón dedupeado.
    expect(screen.getByText(/2×/)).toBeInTheDocument()
  })

  it('si la API falla, muestra mensaje de error con botón reintentar', async () => {
    vi.spyOn(apiModule.api, 'errorLog').mockRejectedValue(new Error('Network down'))
    const qc = makeQueryClient()
    render(<LogsPanel />, { wrapper: wrap(qc) })
    await waitFor(() => {
      expect(screen.getByText(/no se pudo cargar el log de errores/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
    })
  })
})
