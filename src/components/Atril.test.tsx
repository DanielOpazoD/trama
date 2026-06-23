import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Atril, pickRandom } from './Atril'
import { renderWithProviders } from '../test-utils'
import type { Quote } from '../types'

/**
 * Atril lee /api/quotes + /api/entities (vía useQuotesQuery /
 * useEntitiesQuery) y sortea una cita al azar (cita del día), con hojeo
 * cronológico por flechas. Mockeamos fetch con citas conocidas y fijamos
 * Math.random para que el sorteo sea determinístico.
 */

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function quote(
  id: string,
  entityId: string,
  text: string,
  opts: { source?: string; userReflection?: string; createdAt?: string } = {},
): Quote {
  return {
    id,
    entityId,
    text,
    ...(opts.source ? { source: opts.source } : {}),
    ...(opts.userReflection ? { userReflection: opts.userReflection } : {}),
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: opts.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: opts.createdAt ?? '2026-01-01T00:00:00.000Z',
  }
}

const QUOTES = [
  quote('q1', 'e-borges', 'El olvido es la única venganza y el único perdón', {
    source: 'Borges, obra',
    createdAt: '2026-01-01T00:00:00.000Z',
  }),
  quote('q2', 'e-borges', 'segunda cita', {
    userReflection: 'esto me recordó al sur',
    createdAt: '2026-01-02T00:00:00.000Z',
  }),
]

/** El API devuelve filas snake_case; quoteFromRow las transforma. El mock
 *  tiene que hablar el idioma del servidor, no el del cliente. */
function toRow(q: Quote) {
  return {
    id: q.id,
    entity_id: q.entityId,
    text: q.text,
    source: q.source ?? null,
    context: q.context ?? null,
    user_reflection: q.userReflection ?? null,
    linked_quote_ids: q.linkedQuoteIds,
    origin: q.origin,
    created_at: q.createdAt,
    updated_at: q.updatedAt,
  }
}

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
      if (url.includes('/api/quotes')) return jsonResp(quotes.map(toRow))
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

describe('<Atril />', () => {
  it('does not render when open=false', () => {
    stubFetch()
    renderWithProviders(<Atril open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog', { name: 'Atril' })).not.toBeInTheDocument()
  })

  it('draws a quote and shows its attribution', async () => {
    stubFetch()
    vi.spyOn(Math, 'random').mockReturnValue(0) // índice 0 → q1
    renderWithProviders(<Atril open onClose={() => {}} />)
    // El dado sólo aparece una vez sorteada una cita — esperar a que las
    // citas carguen (el diálogo se monta antes, mostrando el estado vacío).
    await screen.findByRole('button', { name: 'Sortear otra cita' })
    const dialog = screen.getByRole('dialog', { name: 'Atril' })
    // El texto se parte en nodos por las guillemets, así que chequeamos el
    // textContent del diálogo completo.
    expect(dialog.textContent).toMatch(/única venganza/)
    expect(dialog.textContent).toMatch(/Borges/)
  })

  it('hojea el archivo con las flechas sin pisar la cita del día', async () => {
    stubFetch()
    vi.spyOn(Math, 'random').mockReturnValue(0) // cita del día → q1 (la más vieja)
    renderWithProviders(<Atril open onClose={() => {}} />)
    await screen.findByRole('button', { name: 'Cita siguiente' })

    fireEvent.click(screen.getByRole('button', { name: 'Cita siguiente' }))
    const dialog = screen.getByRole('dialog', { name: 'Atril' })
    expect(dialog.textContent).toMatch(/segunda cita/)

    // Hojear NO toca la cita del día persistida.
    const stored = JSON.parse(window.localStorage.getItem('trama:sortes')!) as {
      quoteId: string
    }
    expect(stored.quoteId).toBe('q1')

    // También con el teclado, y la vuelta atrás funciona.
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(dialog.textContent).toMatch(/única venganza/)
  })

  it('muestra la reflexión del usuario como marginalia manuscrita', async () => {
    stubFetch()
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // índice 1 → q2 (con reflexión)
    renderWithProviders(<Atril open onClose={() => {}} />)
    const note = await screen.findByText('esto me recordó al sur')
    expect(note).toHaveClass('marginalia-script')
  })

  it('el dado sortea otra cita y la fija como cita del día', async () => {
    stubFetch()
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0) // del día → q1
    renderWithProviders(<Atril open onClose={() => {}} />)
    const dice = await screen.findByRole('button', { name: 'Sortear otra cita' })

    rand.mockReturnValue(0) // pool excluye q1 → q2
    fireEvent.click(dice)
    const dialog = screen.getByRole('dialog', { name: 'Atril' })
    expect(dialog.textContent).toMatch(/segunda cita/)
    const stored = JSON.parse(window.localStorage.getItem('trama:sortes')!) as {
      quoteId: string
    }
    expect(stored.quoteId).toBe('q2')
  })

  it('shows a gentle message when the archive is empty', async () => {
    stubFetch([])
    renderWithProviders(<Atril open onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog', { name: 'Atril' })
    expect(dialog.textContent).toMatch(/Todavía no hay citas/)
    expect(
      screen.queryByRole('button', { name: 'Sortear otra cita' }),
    ).not.toBeInTheDocument()
  })

  it('es un diálogo modal accesible (role=dialog + aria-modal)', async () => {
    stubFetch()
    renderWithProviders(<Atril open onClose={() => {}} />)
    const dialog = await screen.findByRole('dialog', { name: 'Atril' })
    // useModalOverlay exige aria-modal para los lectores de pantalla.
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('calls onClose when ESC is pressed', async () => {
    stubFetch()
    const onClose = vi.fn()
    renderWithProviders(<Atril open onClose={onClose} />)
    await screen.findByRole('dialog', { name: 'Atril' })
    // Escape lo gestiona useModalOverlay: listener en captura sobre document.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
