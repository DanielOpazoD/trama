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
})
