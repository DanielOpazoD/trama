import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { WhatsAppMetricsCard } from './WhatsAppMetricsCard'

describe('<WhatsAppMetricsCard />', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('si la consulta de métricas falla, muestra ErrorState y permite reintentar', async () => {
    vi.spyOn(api, 'getWhatsAppMetrics').mockRejectedValue(new Error('boom'))

    renderWithProviders(<WhatsAppMetricsCard />)

    // El error se nombra como error (role="alert"), no se disfraza de "vacío".
    const alert = await screen.findByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(screen.getByText(/No se pudieron cargar las métricas/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()

    // No cae en el render normal de actividad.
    expect(screen.queryByText(/Actividad ·/i)).not.toBeInTheDocument()
  })

  it('si no hay actividad todavía, se mantiene discreto (sin ErrorState)', async () => {
    vi.spyOn(api, 'getWhatsAppMetrics').mockResolvedValue({
      days: 30,
      total: 0,
      ok: 0,
      failed: 0,
      byKind: [],
      byEvent: [],
      daily: [],
      recent: [],
    })

    const { container } = renderWithProviders(<WhatsAppMetricsCard />)

    // El empty real sigue invisible: no se confunde "vacío" con "roto".
    await waitFor(() => {
      expect(api.getWhatsAppMetrics).toHaveBeenCalled()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })
})
