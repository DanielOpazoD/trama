import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CommandPalette } from './CommandPalette'
import { renderWithProviders } from '../test-utils'
import type { SearchResponse } from '../api'

/**
 * Smoke tests para CommandPalette: verifica navegación + filtrado +
 * acciones quick. Mockeamos /api/entities y /api/quotes con respuestas
 * pequeñas; el componente usa useEntitiesQuery + useQuotesQuery.
 *
 * El buscador global también consulta /api/search (debounced, q≥2). Por
 * defecto devolvemos shape vacío; los tests de server-merge re-stubean con
 * datos para verificar que momentos/crónicas/chat aparecen y se navegan.
 */

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const EMPTY_SEARCH: SearchResponse = {
  entities: [],
  quotes: [],
  momentos: [],
  cronicas: [],
  chat: [],
  mode: 'lexical',
}

/** Mock de fetch con una entidad local y una respuesta de /api/search dada. */
function stubFetch(search: SearchResponse = EMPTY_SEARCH) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/search')) {
        return jsonResp(search)
      }
      if (url.includes('/api/entities')) {
        return jsonResp([
          {
            id: 'e-borges',
            type: 'escritor',
            name: 'Borges',
            year: 1899,
            description: 'escritor argentino',
            origin: { kind: 'manual' },
          },
        ])
      }
      if (url.includes('/api/quotes')) {
        return jsonResp([])
      }
      return jsonResp([])
    }),
  )
}

beforeEach(() => {
  stubFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<CommandPalette />', () => {
  it('does not render when open=false', () => {
    renderWithProviders(
      <CommandPalette
        open={false}
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders with search input + view options when open', () => {
    renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    expect(screen.getByRole('dialog', { name: /buscar/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/buscar/i)).toBeInTheDocument()
    // Las 8 vistas aparecen en la lista inicial
    expect(screen.getByText('Inicio')).toBeInTheDocument()
    expect(screen.getByText('Grafo')).toBeInTheDocument()
    expect(screen.getByText('Citas')).toBeInTheDocument()
  })

  it('filters by query — typing "entid" shrinks results', () => {
    const { container } = renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    const input = screen.getByPlaceholderText(/buscar/i)
    fireEvent.change(input, { target: { value: 'entid' } })
    // El highlight parte "Entidades" en múltiples elementos (<strong>);
    // chequeamos por textContent del list.
    const list = container.querySelector('ul')!
    expect(list.textContent).toMatch(/Entidades/)
    // "Inicio" desaparece porque no contiene "entid"
    expect(list.textContent).not.toMatch(/Inicio/)
  })

  it('exposes quick actions when onAction is provided', () => {
    renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
        onAction={() => {}}
      />,
    )
    expect(screen.getByText('Nueva entidad')).toBeInTheDocument()
    expect(screen.getByText('Nueva cita')).toBeInTheDocument()
    expect(screen.getByText('Configuración')).toBeInTheDocument()
  })

  it('hides quick actions when onAction is not provided', () => {
    renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    expect(screen.queryByText('Nueva entidad')).not.toBeInTheDocument()
  })

  it('comando "#pass" ofrece revelar un módulo de Notas y lo despacha', () => {
    const onRevealNotasModule = vi.fn()
    renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
        onRevealNotasModule={onRevealNotasModule}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/buscar/i), {
      target: { value: '#pass' },
    })
    fireEvent.click(screen.getByRole('button', { name: /abrir claves/i }))
    expect(onRevealNotasModule).toHaveBeenCalledWith('claves')
  })

  it('calls onClose when ESC is pressed', () => {
    const onClose = vi.fn()
    renderWithProviders(
      <CommandPalette
        open
        onClose={onClose}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('usa el onClose vigente en el listener global cuando el padre re-renderiza', () => {
    const staleOnClose = vi.fn()
    const currentOnClose = vi.fn()
    const { rerender } = renderWithProviders(
      <CommandPalette
        open
        onClose={staleOnClose}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )

    rerender(
      <CommandPalette
        open
        onClose={currentOnClose}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(staleOnClose).not.toHaveBeenCalled()
    expect(currentOnClose).toHaveBeenCalledOnce()
  })

  it('no oculta dependencias del listener global con suppressions de exhaustive-deps', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/CommandPalette.tsx'),
      'utf8',
    )
    expect(source).not.toContain('eslint-disable-next-line react-hooks/exhaustive-deps')
  })

  it('merges server results (momento + crónica + chat) for queries ≥2', async () => {
    stubFetch({
      ...EMPTY_SEARCH,
      momentos: [
        {
          id: 'm-1',
          kind: 'nota',
          text: 'una nota sobre el mar',
          capturedAt: '2026-05-01',
          score: 1,
        },
      ],
      cronicas: [{ id: 'c-1', year: 2026, month: 3, text: 'el mes del mar', score: 1 }],
      chat: [
        {
          id: 'cm-1',
          threadId: 't-9',
          threadTitle: 'sobre el mar',
          role: 'user',
          text: 'hablemos del mar',
          score: 1,
        },
      ],
    })
    const { container } = renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    const input = screen.getByPlaceholderText(/buscar/i)
    fireEvent.change(input, { target: { value: 'mar' } })
    // El fetch es debounced (180ms) y HighlightedText parte el texto en
    // varios nodos (<strong>); chequeamos por textContent del list, que los
    // concatena. waitFor cubre el debounce.
    const list = container.querySelector('ul')!
    await waitFor(() => expect(list.textContent).toMatch(/una nota sobre el mar/))
    expect(list.textContent).toMatch(/el mes del mar/)
    expect(list.textContent).toMatch(/hablemos del mar/)
    // El sublabel de la crónica usa el nombre del mes.
    expect(list.textContent).toMatch(/crónica · marzo 2026/)
  })

  it('opens a chat thread via onOpenThread when a chat result is clicked', async () => {
    const onOpenThread = vi.fn()
    const onClose = vi.fn()
    stubFetch({
      ...EMPTY_SEARCH,
      chat: [
        {
          id: 'cm-1',
          threadId: 't-9',
          threadTitle: 'sobre el mar',
          role: 'user',
          text: 'hablemos del mar',
          score: 1,
        },
      ],
    })
    const { container } = renderWithProviders(
      <CommandPalette
        open
        onClose={onClose}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
        onOpenThread={onOpenThread}
      />,
    )
    const input = screen.getByPlaceholderText(/buscar/i)
    fireEvent.change(input, { target: { value: 'mar' } })
    await waitFor(() =>
      expect(container.querySelector('ul')!.textContent).toMatch(/hablemos del mar/),
    )
    const chatButton = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('hablemos del mar'),
    )!
    fireEvent.click(chatButton)
    expect(onOpenThread).toHaveBeenCalledWith('t-9')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
