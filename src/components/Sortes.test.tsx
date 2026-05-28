import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Sortes, pickRandom } from './Sortes'
import { renderWithProviders } from '../test-utils'
import type { Quote } from '../types'

/**
 * Sortes lee /api/quotes + /api/entities (vía useQuotesQuery /
 * useEntitiesQuery) y sortea una cita al azar. Mockeamos fetch con dos
 * citas y fijamos Math.random para que el sorteo sea determinístico.
 */

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function quote(id: string, entityId: string, text: string, source?: string): Quote {
  return {
    id,
    entityId,
    text,
    ...(source ? { source } : {}),
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const QUOTES = [
  quote(
    'q1',
    'e-borges',
    'El olvido es la única venganza y el único perdón',
    'Borges, obra',
  ),
  quote('q2', 'e-borges', 'segunda cita'),
]

function stubFetch(quotes: Quote[] = QUOTES) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/entities')) {
        return jsonResp([
          {
            id: 'e-borges',
            type: 'escritor',
            name: 'Borges',
            origin: { kind: 'manual' },
          },
        ])
      }
      if (url.includes('/api/quotes')) return jsonResp(quotes)
      return jsonResp([])
    }),
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('pickRandom', () => {
  it('returns null for an empty archive', () => {
    expect(pickRandom([])).toBeNull()
  })

  it('returns the only quote when there is just one', () => {
    expect(pickRandom([QUOTES[0]!])?.id).toBe('q1')
  })

  it('never returns the excluded quote when others exist', () => {
    for (let i = 0; i < 50; i++) {
      expect(pickRandom(QUOTES, 'q1')?.id).toBe('q2')
    }
  })

  it('still returns the only quote even if it is the excluded one', () => {
    expect(pickRandom([QUOTES[0]!], 'q1')?.id).toBe('q1')
  })
})

describe('<Sortes />', () => {
  it('does not render when open=false', () => {
    stubFetch()
    renderWithProviders(<Sortes open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog', { name: 'Sortes' })).not.toBeInTheDocument()
  })

  it('draws a quote and shows its attribution', async () => {
    stubFetch()
    vi.spyOn(Math, 'random').mockReturnValue(0) // índice 0 → q1
    renderWithProviders(<Sortes open onClose={() => {}} />)
    // "otra" sólo aparece una vez sorteada una cita — esperar a que las
    // citas carguen (el diálogo se monta antes, mostrando el estado vacío).
    await screen.findByText('otra')
    const dialog = screen.getByRole('dialog', { name: 'Sortes' })
    // El texto se parte en nodos por las guillemets, así que chequeamos el
    // textContent del diálogo completo.
    expect(dialog.textContent).toMatch(/única venganza/)
    expect(dialog.textContent).toMatch(/Borges/)
  })

  it('shows a gentle message when the archive is empty', async () => {
    stubFetch([])
    renderWithProviders(<Sortes open onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog', { name: 'Sortes' })
    expect(dialog.textContent).toMatch(/Todavía no hay citas/)
    expect(screen.queryByText('otra')).not.toBeInTheDocument()
  })

  it('calls onClose when ESC is pressed', async () => {
    stubFetch()
    const onClose = vi.fn()
    renderWithProviders(<Sortes open onClose={onClose} />)
    await screen.findByRole('dialog', { name: 'Sortes' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
