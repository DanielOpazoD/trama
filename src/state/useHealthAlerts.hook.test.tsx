import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type HealthAlert, type HealthResponse } from '../api'
import { acknowledgeHealthAlerts, useHealthAlerts } from './useHealthAlerts'

const ACK_KEY = 'trama:health-alerts-acknowledged'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function wrapWith(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

function health(alerts: HealthAlert[]): HealthResponse {
  return {
    counts: { entities: 1, quotes: 2, relationships: 3 },
    month: { calls: 0, tokensIn: 0, tokensOut: 0, costCents: 0 },
    budget: { limitCents: 1000, remainingCents: 1000, pct: 0 },
    auth: {
      clerkConfigured: false,
      legacyFallbackAllowed: false,
      legacyOwnerMapped: false,
      mode: 'legacy-single-user',
    },
    operational: {
      requestId: 'rid-health-alerts',
      databaseReachable: true,
      runtimeApiRoutesContract: 'check:runtime-api-routes',
      productionSmokeCommand: 'npm run smoke:production-report',
      legacyDataReassignmentCommand:
        'npm run legacy-data-reassignment:dry-run -- --markdown',
      logRedaction: 'structured-redaction',
    },
    byProvider: [],
    recentErrors: [],
    status: alerts.some((a) => a.severity === 'error')
      ? 'critical'
      : alerts.length > 0
        ? 'degraded'
        : 'ok',
    alerts,
    embeddings: { pendingEntities: 0, pendingQuotes: 0 },
    dailyCost: [],
    webVitals: [],
  }
}

const alerts: HealthAlert[] = [
  {
    severity: 'info',
    code: 'embeddings-pending',
    label: 'Embeddings pendientes',
    hint: 'Hay cola de embeddings.',
  },
  {
    severity: 'warn',
    code: 'budget-near-cap',
    label: 'Presupuesto cerca del límite',
    hint: 'Revisa el gasto mensual.',
  },
  {
    severity: 'error',
    code: 'errors-high-24h',
    label: 'Errores altos',
    hint: 'Hay errores recientes.',
  },
]

describe('useHealthAlerts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('expone códigos no vistos, count y severidad máxima desde /api/health', async () => {
    vi.spyOn(api, 'getHealth').mockResolvedValue(health(alerts))
    const qc = makeQueryClient()

    const { result } = renderHook(() => useHealthAlerts(), { wrapper: wrapWith(qc) })

    await waitFor(() => expect(result.current.count).toBe(3))
    expect(result.current.alerts).toEqual(alerts)
    expect(result.current.unseenCodes).toEqual([
      'embeddings-pending',
      'budget-near-cap',
      'errors-high-24h',
    ])
    expect(result.current.maxSeverity).toBe('error')
  })

  it('respeta acknowledgments previos y se actualiza con el evento custom', async () => {
    window.localStorage.setItem(ACK_KEY, JSON.stringify(['budget-near-cap']))
    vi.spyOn(api, 'getHealth').mockResolvedValue(health(alerts.slice(1)))
    const qc = makeQueryClient()

    const { result } = renderHook(() => useHealthAlerts(), { wrapper: wrapWith(qc) })

    await waitFor(() => expect(result.current.unseenCodes).toEqual(['errors-high-24h']))
    expect(result.current.maxSeverity).toBe('error')

    act(() => acknowledgeHealthAlerts(['budget-near-cap', 'errors-high-24h']))

    await waitFor(() => expect(result.current.count).toBe(0))
    expect(result.current.unseenCodes).toEqual([])
    expect(result.current.maxSeverity).toBeNull()
  })

  it('ignora localStorage corrupto y trata todas las alertas como no vistas', async () => {
    window.localStorage.setItem(ACK_KEY, '{malformed')
    vi.spyOn(api, 'getHealth').mockResolvedValue(health([alerts[1]!]))
    const qc = makeQueryClient()

    const { result } = renderHook(() => useHealthAlerts(), { wrapper: wrapWith(qc) })

    await waitFor(() => expect(result.current.unseenCodes).toEqual(['budget-near-cap']))
    expect(result.current.count).toBe(1)
    expect(result.current.maxSeverity).toBe('warn')
  })

  it('si el endpoint falla mantiene un resumen vacío sin mostrar falsos positivos', async () => {
    const spy = vi.spyOn(api, 'getHealth').mockRejectedValue(new Error('offline'))
    const qc = makeQueryClient()

    const { result } = renderHook(() => useHealthAlerts(), { wrapper: wrapWith(qc) })

    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(result.current.alerts).toEqual([])
    expect(result.current.unseenCodes).toEqual([])
    expect(result.current.count).toBe(0)
    expect(result.current.maxSeverity).toBeNull()
  })
})
