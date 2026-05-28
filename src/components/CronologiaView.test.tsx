import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { CronologiaView } from './CronologiaView'
import { renderWithProviders } from '../test-utils'
import type { CronologiaResponse } from '../api'

/**
 * Smoke test de CronologiaView: verifica que las cuatro corrientes se
 * rendericen, que se agrupen por estación, y que una cita sea clickeable
 * (→ onSelectEntity). Mockeamos /api/cronologia con una página fija.
 *
 * Todas las fechas caen en marzo 2026 → Otoño 2026 (hemisferio sur), así
 * el grupo de estación es único e independiente de la TZ del runner.
 */

const RESPONSE: CronologiaResponse = {
  nextCursor: null,
  entradas: [
    {
      kind: 'cronica',
      id: 'c-1',
      occurredAt: '2026-03-20T12:00:00.000Z',
      year: 2026,
      month: 3,
      text: 'el ensayo del mes',
    },
    {
      kind: 'cita',
      id: 'q-1',
      occurredAt: '2026-03-15T12:00:00.000Z',
      text: 'una cita sobre el mar',
      source: 'Ficciones',
      entityId: 'e-borges',
      entityName: 'Borges',
    },
    {
      kind: 'momento',
      id: 'm-1',
      occurredAt: '2026-03-10T12:00:00.000Z',
      momentoKind: 'nota',
      text: 'una nota del día',
    },
    {
      kind: 'escucha',
      id: 's-1',
      occurredAt: '2026-03-05T12:00:00.000Z',
      weekStart: '2026-03-02',
      topArtist: 'Spinetta',
      topArtistPlays: 12,
      totalPlays: 30,
    },
  ],
}

function stubFetch(res: CronologiaResponse = RESPONSE) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      const body = url.includes('/api/cronologia')
        ? res
        : { entradas: [], nextCursor: null }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
}

beforeEach(() => {
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<CronologiaView />', () => {
  it('renders the four streams grouped under one season', async () => {
    renderWithProviders(<CronologiaView onSelectEntity={() => {}} />)
    expect(await screen.findByText(/una cita sobre el mar/)).toBeInTheDocument()
    expect(screen.getByText(/una nota del día/)).toBeInTheDocument()
    expect(screen.getByText('Spinetta')).toBeInTheDocument()
    expect(screen.getByText(/el ensayo del mes/)).toBeInTheDocument()
    // Encabezado de estación (hemisferio sur): marzo → otoño.
    expect(screen.getByText('Otoño 2026')).toBeInTheDocument()
  })

  it('calls onSelectEntity when a cita is clicked', async () => {
    const onSelectEntity = vi.fn()
    renderWithProviders(<CronologiaView onSelectEntity={onSelectEntity} />)
    const citaButton = await screen.findByRole('button', {
      name: /una cita sobre el mar/,
    })
    fireEvent.click(citaButton)
    expect(onSelectEntity).toHaveBeenCalledWith('e-borges')
  })

  it('shows an empty state when there are no entries', async () => {
    stubFetch({ entradas: [], nextCursor: null })
    renderWithProviders(<CronologiaView onSelectEntity={() => {}} />)
    await waitFor(() =>
      expect(screen.getByText(/el tiempo todavía está en blanco/i)).toBeInTheDocument(),
    )
  })
})
