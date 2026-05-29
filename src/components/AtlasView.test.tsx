import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { AtlasView } from './AtlasView'
import { renderWithProviders } from '../test-utils'
import type { AtlasResponse } from '../api'

/**
 * Smoke test de AtlasView: verifica que las constelaciones se rendericen
 * con su nombre + glosa + entidades-miembro, que un miembro sea clickeable
 * (→ onSelectEntity), y que el estado vacío aparezca cuando no hay snapshot.
 * Mockeamos GET /api/atlas con una respuesta fija.
 */

const RESPONSE: AtlasResponse = {
  generatedAt: '2026-05-20T12:00:00.000Z',
  entityCount: 3,
  provider: 'deepseek',
  model: 'deepseek-chat',
  clusters: [
    {
      id: 'c-0',
      name: 'Vanguardias rioplatenses',
      summary: 'el hilo del barroco y sus espejos',
      members: [
        { id: 'e-borges', name: 'Borges', type: 'persona', year: 1899 },
        { id: 'e-bioy', name: 'Bioy Casares', type: 'persona', year: null },
      ],
    },
    {
      id: 'c-1',
      name: 'Rock argentino',
      summary: 'lo que sonó esos años',
      members: [{ id: 'e-spinetta', name: 'Spinetta', type: 'músico', year: null }],
    },
  ],
}

function stubFetch(res: AtlasResponse = RESPONSE) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      const body = url.includes('/api/atlas') ? res : {}
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

describe('<AtlasView />', () => {
  it('renders constellations with names, summaries and members', async () => {
    renderWithProviders(<AtlasView onSelectEntity={() => {}} />)
    expect(await screen.findByText('Vanguardias rioplatenses')).toBeInTheDocument()
    expect(screen.getByText('Rock argentino')).toBeInTheDocument()
    expect(screen.getByText('el hilo del barroco y sus espejos')).toBeInTheDocument()
    expect(screen.getByText('Spinetta')).toBeInTheDocument()
    // Pie de página con la fecha del snapshot.
    expect(screen.getByText(/Atlas de 3 entidades/)).toBeInTheDocument()
  })

  it('calls onSelectEntity when a member is clicked', async () => {
    const onSelectEntity = vi.fn()
    renderWithProviders(<AtlasView onSelectEntity={onSelectEntity} />)
    const memberButton = await screen.findByRole('button', { name: /Borges/ })
    fireEvent.click(memberButton)
    expect(onSelectEntity).toHaveBeenCalledWith('e-borges')
  })

  it('shows an empty state when there is no snapshot', async () => {
    stubFetch({
      generatedAt: null,
      entityCount: 0,
      provider: null,
      model: null,
      clusters: [],
    })
    renderWithProviders(<AtlasView onSelectEntity={() => {}} />)
    await waitFor(() =>
      expect(screen.getByText(/el cielo todavía no está trazado/i)).toBeInTheDocument(),
    )
  })
})
