import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, type HealthResponse } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { HealthPanel } from './HealthPanel'

const HEALTH_FIXTURE: HealthResponse = {
  counts: { entities: 12, quotes: 34, relationships: 5 },
  month: {
    calls: 8,
    tokensIn: 1200,
    tokensOut: 450,
    costCents: 123,
  },
  budget: {
    limitCents: 1000,
    remainingCents: 877,
    pct: 0.123,
  },
  byProvider: [{ provider: 'openai', model: 'gpt-test', calls: 4, costCents: 80 }],
  recentErrors: [
    {
      id: 'err-1',
      functionName: 'momentos',
      httpMethod: 'POST',
      httpPath: '/api/momentos',
      statusCode: 500,
      message: 'fallo repetido',
      createdAt: '2026-05-31T10:00:00Z',
    },
    {
      id: 'err-2',
      functionName: 'momentos',
      httpMethod: 'POST',
      httpPath: '/api/momentos',
      statusCode: 500,
      message: 'fallo repetido',
      createdAt: '2026-05-31T10:05:00Z',
    },
  ],
  alerts: [
    {
      severity: 'warn',
      code: 'budget-near',
      label: 'Presupuesto cerca del límite',
      hint: 'Revisa los costos de IA antes de seguir.',
    },
  ],
  auth: {
    clerkConfigured: true,
    legacyFallbackAllowed: false,
    legacyOwnerMapped: true,
    mode: 'clerk',
  },
  operational: {
    requestId: 'rid-health-panel',
    databaseReachable: true,
    runtimeApiRoutesContract: 'check:runtime-api-routes',
    productionSmokeCommand: 'npm run smoke:production-report',
    logRedaction: 'structured-redaction',
  },
  embeddings: { pendingEntities: 0, pendingQuotes: 0 },
  dailyCost: [
    { day: '2026-05-30', costCents: 0, calls: 0 },
    { day: '2026-05-31', costCents: 80, calls: 4 },
  ],
}

describe('<HealthPanel />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('muestra conteos, gasto, alertas, providers y errores deduplicados', async () => {
    vi.spyOn(api, 'getHealth').mockResolvedValue(HEALTH_FIXTURE)

    renderWithProviders(<HealthPanel />)

    expect(await screen.findByText('Presupuesto cerca del límite')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('34')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText(/12% del cap/i)).toBeInTheDocument()
    expect(screen.getByText(/USD 1\.23/i)).toBeInTheDocument()
    expect(screen.getByText(/openai/i)).toBeInTheDocument()
    expect(screen.getByText(/gpt-test/i)).toBeInTheDocument()
    expect(screen.getByText(/2×/i)).toBeInTheDocument()
    expect(screen.getByText(/fallo repetido/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Consumo de IA por día/i)).toBeInTheDocument()
  })

  it('muestra error y reintenta la consulta', async () => {
    const getHealth = vi
      .spyOn(api, 'getHealth')
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce({ ...HEALTH_FIXTURE, alerts: [], recentErrors: [] })

    renderWithProviders(<HealthPanel />)

    expect(
      await screen.findByText(/No se pudo cargar el estado del sistema/i),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /reintentar/i }))

    await waitFor(() => {
      expect(getHealth).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText(/sin errores/i)).toBeInTheDocument()
  })

  it('muestra alerta operativa cuando Clerk permite fallback legacy', async () => {
    vi.spyOn(api, 'getHealth').mockResolvedValue({
      ...HEALTH_FIXTURE,
      auth: {
        clerkConfigured: true,
        legacyFallbackAllowed: true,
        legacyOwnerMapped: true,
        mode: 'clerk-with-legacy-fallback',
      },
      alerts: [
        {
          severity: 'warn',
          code: 'auth_legacy_fallback',
          label: 'Fallback legacy activo',
          hint: 'Producción no debería aceptar requests sin token Clerk.',
        },
      ],
    })

    renderWithProviders(<HealthPanel />)

    expect(await screen.findByText('Fallback legacy activo')).toBeInTheDocument()
    expect(screen.getByText(/requests sin token Clerk/i)).toBeInTheDocument()
  })

  it('copia un diagnóstico operativo al clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    vi.spyOn(api, 'getHealth').mockResolvedValue(HEALTH_FIXTURE)

    renderWithProviders(<HealthPanel />)

    await screen.findByText('Presupuesto cerca del límite')
    await userEvent.click(screen.getByRole('button', { name: /copiar diagnóstico/i }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]?.[0]).toContain('Trama health diagnostic')
    expect(writeText.mock.calls[0]?.[0]).toContain('auth=clerk')
    expect(writeText.mock.calls[0]?.[0]).toContain('requestId=rid-health-panel')
    expect(writeText.mock.calls[0]?.[0]).toContain('databaseReachable=true')
    expect(writeText.mock.calls[0]?.[0]).toContain(
      'runtimeApiRoutesContract=check:runtime-api-routes',
    )
    expect(writeText.mock.calls[0]?.[0]).toContain(
      'productionSmokeCommand=npm run smoke:production-report',
    )
    expect(writeText.mock.calls[0]?.[0]).toContain(
      'counts=12 entities, 34 quotes, 5 relationships',
    )
    expect(await screen.findByText(/diagnóstico copiado/i)).toBeInTheDocument()
  })
})
