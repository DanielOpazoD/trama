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

/** Respuesta de /api/query/nl (preguntar a tu trama). Se sobreescribe en
    el test del flujo de preguntar. */
const NL_RESPONSE = {
  query: { from: ['entity'], where: { field: 'type', op: 'eq', value: 'persona' } },
  items: [
    {
      kind: 'entity',
      id: 'e-nl',
      title: 'Sócrates',
      snippet: 'filósofo',
      createdAt: '2024-01-01',
      tags: [],
    },
  ],
  nextCursor: null,
  source: 'llm',
}

/** Mock de fetch con una entidad local y una respuesta de /api/search dada. */
function stubFetch(
  search: SearchResponse = EMPTY_SEARCH,
  counts = { entities: 1, quotes: 0, relationships: 0, momentos: 0 },
  opts: { savedQueries?: unknown[]; nl?: unknown } = {},
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/counts')) {
        return jsonResp(counts)
      }
      if (url.includes('/api/saved-queries')) {
        return jsonResp({ items: opts.savedQueries ?? [] })
      }
      if (url.includes('/api/query/nl')) {
        return jsonResp(opts.nl ?? NL_RESPONSE)
      }
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
    // 'Inicio' aparece en la fila Y en el peek del resultado resaltado.
    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('complementary', { name: /vista previa/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Grafo')).toBeInTheDocument()
    expect(screen.getByText('Citas')).toBeInTheDocument()
    expect(screen.queryByText('Flujo')).not.toBeInTheDocument()
  })

  it('presenta las vistas como índice de Catálogo, Lentes y Diálogo', () => {
    const { container } = renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )

    const listText = container.querySelector('ul')?.textContent ?? ''
    expect(listText).toMatch(/Entidades.*Catálogo/i)
    expect(listText).toMatch(/Grafo.*Lentes/i)
    expect(listText).toMatch(/Sugerencias.*Diálogo/i)
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
    // Escape lo intercepta useModalOverlay con un listener en `document`
    // (fase de captura), por eso disparamos sobre `document`.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('es un diálogo modal accesible (role=dialog + aria-modal)', () => {
    renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: /buscar/i })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('enfoca el input de búsqueda al abrir (focus trap)', async () => {
    renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    const input = screen.getByPlaceholderText(/buscar/i)
    // El focus trap de useModalOverlay enfoca el primer focuseable del
    // diálogo (el input) en el siguiente microtick tras montar.
    await waitFor(() => expect(document.activeElement).toBe(input))
  })

  it('cierra al hacer clic en el backdrop', () => {
    const onClose = vi.fn()
    renderWithProviders(
      <CommandPalette
        open
        onClose={onClose}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
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

    fireEvent.keyDown(document, { key: 'Escape' })

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

  it('usa búsqueda server-first sin descargar entidades/citas cuando counts supera el umbral local', async () => {
    stubFetch(
      {
        ...EMPTY_SEARCH,
        entities: [
          {
            id: 'e-server',
            name: 'Borges remoto',
            type: 'escritor',
            year: null,
            description: 'resultado desde search',
            lexical: 1,
            semantic: 0,
            score: 1,
          },
        ],
      },
      { entities: 2500, quotes: 8000, relationships: 0, momentos: 0 },
    )
    const { container } = renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/buscar/i), {
      target: { value: 'borges' },
    })

    await waitFor(() =>
      expect(container.querySelector('ul')!.textContent).toMatch(/Borges remoto/),
    )
    const fetchMock = vi.mocked(fetch)
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.some((url) => url.includes('/api/search'))).toBe(true)
    expect(urls.some((url) => url.includes('/api/entities'))).toBe(false)
    expect(urls.some((url) => url.includes('/api/quotes'))).toBe(false)
  })

  it('preguntar → corre la consulta, muestra resultados y navega al hit', async () => {
    const onSelectEntity = vi.fn()
    const onClose = vi.fn()
    const { container } = renderWithProviders(
      <CommandPalette
        open
        onClose={onClose}
        onNavigate={() => {}}
        onSelectEntity={onSelectEntity}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/buscar o preguntar/i), {
      target: { value: 'filósofos' },
    })
    // El item "Preguntar a tu trama" aparece (query ≥3).
    const askButton = await waitFor(() => {
      const b = [...container.querySelectorAll('button')].find((btn) =>
        btn.textContent?.includes('Preguntar a tu trama'),
      )
      if (!b) throw new Error('ask item not found')
      return b
    })
    fireEvent.click(askButton)

    // Modo resultados: aparece el hit de la consulta NL y el affordance volver.
    expect(await screen.findByText('Sócrates')).toBeInTheDocument()
    expect(screen.getByText(/volver a buscar/i)).toBeInTheDocument()

    // Seleccionar el hit entity llama onSelectEntity y cierra.
    fireEvent.click(screen.getByText('Sócrates'))
    expect(onSelectEntity).toHaveBeenCalledWith('e-nl')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape en modo resultados vuelve a búsqueda sin cerrar', async () => {
    const onClose = vi.fn()
    const { container } = renderWithProviders(
      <CommandPalette
        open
        onClose={onClose}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText(/buscar o preguntar/i), {
      target: { value: 'filósofos' },
    })
    const askButton = await waitFor(() => {
      const b = [...container.querySelectorAll('button')].find((btn) =>
        btn.textContent?.includes('Preguntar a tu trama'),
      )
      if (!b) throw new Error('ask item not found')
      return b
    })
    fireEvent.click(askButton)
    expect(await screen.findByText('Sócrates')).toBeInTheDocument()

    // Escape vuelve a búsqueda: el palette sigue abierto (onClose no llamado).
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Sócrates')).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('expone consultas guardadas y las corre', async () => {
    stubFetch(EMPTY_SEARCH, undefined, {
      savedQueries: [
        {
          id: 'sq-1',
          name: 'Mis filósofos',
          description: null,
          query: { from: ['entity'] },
          pinned: false,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ],
    })
    renderWithProviders(
      <CommandPalette
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onSelectEntity={() => {}}
      />,
    )
    expect(await screen.findByText('Mis filósofos')).toBeInTheDocument()
  })
})
