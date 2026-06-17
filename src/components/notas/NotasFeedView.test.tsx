import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { NotasFeedView } from './NotasFeedView'
import { ToastHost } from '../ToastHost'

// compressImage usa canvas/Image, que happy-dom no implementa; lo neutralizamos
// para probar el cableado de captura por pegado sin colgar en la carga de Image.
vi.mock('../momentos/helpers', async (importActual) => {
  const actual = await importActual<typeof import('../momentos/helpers')>()
  return { ...actual, compressImage: vi.fn(async (f: File) => f) }
})

// La lista del feed está virtualizada (TanStack Virtual atado a #main-scroll).
// happy-dom reporta tamaños en 0, así que el virtualizer no montaría ninguna
// tarjeta y los tests de comportamiento (qué se renderiza, segmentos, búsqueda)
// no podrían afirmar sobre el DOM. Mockeamos el wrapper con un passthrough que
// "monta todo": la virtualización real se verifica en producción (mismo hook
// que Citas/Entidades) y en su propio test unitario; acá probamos el cableado
// del feed sin pelear con la medición de layout de happy-dom.
vi.mock('../../hooks/useMainScrollVirtualizer', () => ({
  useMainScrollVirtualizer: ({ count }: { count: number }) => ({
    listRef: { current: null },
    virtualizer: {
      measure: measureFeedRows,
      getTotalSize: () => count * 200,
      getVirtualItems: () =>
        Array.from({ length: count }, (_, index) => ({
          key: index,
          index,
          start: index * 200,
          size: 200,
        })),
      measureElement: () => {},
      scrollToIndex: () => {},
      options: { scrollMargin: 0 },
    },
  }),
}))

const measureFeedRows = vi.hoisted(() => vi.fn())

const noteRows = [
  {
    id: 'note-1',
    content: 'Idea matriz sobre memoria #memoria',
    tags: ['memoria'],
    pinned: false,
    promoted_momento_id: null,
    created_at: '2026-06-10T10:00:00.000Z',
    updated_at: '2026-06-10T10:00:00.000Z',
    has_images: false,
  },
]

const recorteRows = [
  {
    id: 'recorte-1',
    text: 'Una cita capturada de la web',
    source_url: 'https://ejemplo.com/articulo',
    source_title: 'Un artículo memorable',
    source_author: 'Autora Ejemplo',
    note: null,
    image_url: null,
    image_key: null,
    capture_mode: 'citation',
    status: 'pending',
    promoted_target: null,
    promoted_id: null,
    captured_at: null,
    created_at: '2026-06-11T10:00:00.000Z',
    updated_at: '2026-06-11T10:00:00.000Z',
  },
]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Construye la respuesta del endpoint `/api/notas-feed` a partir de las filas
 * de prueba, replicando server-side los filtros que la vista ejerce en los
 * tests (segmento, búsqueda lexical). Devuelve la forma `{ items, nextCursor }`
 * con los ítems ya discriminados por `type` (igual que el servidor real).
 */
function buildFeedResponse(params: URLSearchParams) {
  const segment = params.get('segment') ?? 'todo'
  const q = (params.get('q') ?? '').trim().toLowerCase()

  const noteItems =
    segment === 'capturas'
      ? []
      : noteRows
          .filter((n) => (q ? `${n.content}\n`.toLowerCase().includes(q) : true))
          .map((note) => ({
            type: 'note' as const,
            id: note.id,
            createdAt: note.created_at,
            note,
          }))

  const recorteItems =
    segment === 'escritas'
      ? []
      : recorteRows
          .filter((r) =>
            q
              ? `${r.text}\n${r.source_title ?? ''}\n${r.source_author ?? ''}`
                  .toLowerCase()
                  .includes(q)
              : true,
          )
          .map((recorte) => ({
            type: 'recorte' as const,
            id: recorte.id,
            createdAt: recorte.created_at,
            recorte,
          }))

  const items = [...noteItems, ...recorteItems].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
  return { items, nextCursor: null }
}

function stubFeedFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/suggest') && method === 'POST')
      return jsonResponse({
        target: 'momento',
        title: 'Momento sugerido',
        rationale: '',
        relatedEntityIds: [],
        suggestedEntityName: null,
        suggestedEntityType: null,
        relatedEntities: [],
      })
    if (url.includes('/unpromote') && method === 'POST')
      return jsonResponse({ ...recorteRows[0], status: 'pending', promoted_target: null })
    if (url.includes('/promote') && method === 'POST')
      return jsonResponse({
        ...recorteRows[0],
        status: 'promoted',
        promoted_target: 'momento',
        promoted_id: 'm1',
      })
    // Feed unificado paginado server-side (el seam useNotasFeed lo consume).
    if (url.startsWith('/api/notas-feed') && method === 'GET') {
      const qs = new URL(url, 'http://localhost').searchParams
      return jsonResponse(buildFeedResponse(qs))
    }
    // El calendario y el universo de tags siguen leyendo todas las notas.
    if (url.startsWith('/api/notes') && method === 'GET') return jsonResponse(noteRows)
    if (url.startsWith('/api/recortes') && method === 'GET')
      return jsonResponse(recorteRows)
    if (url.includes('recortes-image-upload') && method === 'POST')
      return jsonResponse({ imageKey: 'u/shot.webp', mime: 'image/webp', size: 99 })
    if (url === '/api/recortes' && method === 'POST')
      return jsonResponse({ ...recorteRows[0], id: 'nuevo', capture_mode: 'image' }, 201)
    // counts/home invalidations refetch tras promover/curar.
    if (url.startsWith('/api/counts') || url.startsWith('/api/home'))
      return jsonResponse({})
    throw new Error(`Fetch inesperado en NotasFeedView.test: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  measureFeedRows.mockClear()
  stubFeedFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<NotasFeedView />', () => {
  it('renderiza notas y recortes juntos en el feed unificado', async () => {
    renderWithProviders(<NotasFeedView />)

    expect(await screen.findByText(/Idea matriz sobre memoria/)).toBeInTheDocument()
    expect(screen.getByText(/Una cita capturada de la web/)).toBeInTheDocument()
  })

  it('re-mide la lista virtualizada cuando el feed carga ítems de altura variable', async () => {
    renderWithProviders(<NotasFeedView />)

    expect(await screen.findByText(/Idea matriz sobre memoria/)).toBeInTheDocument()
    await waitFor(() => expect(measureFeedRows).toHaveBeenCalled())
  })

  it('conserva el composer de creación de notas', () => {
    renderWithProviders(<NotasFeedView />)
    expect(screen.getByPlaceholderText(/Escribe una nota/)).toBeInTheDocument()
  })

  it('al pegar un enlace solo, ofrece guardarlo como recorte', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NotasFeedView />)

    const composer = screen.getByPlaceholderText(/Escribe una nota/)
    await user.type(composer, 'https://ejemplo.com/articulo')

    expect(screen.getByText(/se guardará como recorte/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar enlace' })).toBeInTheDocument()

    // "guardar como nota" anula la heurística y vuelve al flujo de nota.
    await user.click(screen.getByRole('button', { name: 'guardar como nota' }))
    expect(screen.getByRole('button', { name: 'Guardar nota' })).toBeInTheDocument()
  })

  it('al pegar una imagen, la adjunta a la nota (anexo pendiente, no recorte)', async () => {
    renderWithProviders(<NotasFeedView />)

    const composer = screen.getByPlaceholderText(/Escribe una nota/)
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.paste(composer, {
      clipboardData: { files: [file], getData: () => '' },
    })

    // La imagen aparece como anexo pendiente de la nota, no como recorte suelto.
    expect(await screen.findByText('shot.png')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Quitar anexo pendiente' }),
    ).toBeInTheDocument()
  })

  it('triage por menú ⋯: «→ momento» abre el modal de promoción prellenado', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <>
        <NotasFeedView />
        <ToastHost />
      </>,
    )

    await screen.findByText(/Una cita capturada de la web/)

    // La curaduría vive en el menú ⋯ (ya no hay botón «curar»).
    expect(screen.queryByRole('button', { name: 'curar' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Acciones del recorte' }))
    await user.click(screen.getByRole('menuitem', { name: /→ momento/ }))

    // Se abre el modal de promoción (no promueve directo: el usuario confirma).
    expect(
      await screen.findByRole('dialog', { name: 'Promover a momento' }),
    ).toBeInTheDocument()
  })

  it("el segmento 'Escritas' oculta los recortes", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NotasFeedView />)

    expect(await screen.findByText(/Idea matriz sobre memoria/)).toBeInTheDocument()
    expect(screen.getByText(/Una cita capturada de la web/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Escritas' }))

    expect(screen.getByText(/Idea matriz sobre memoria/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText(/Una cita capturada de la web/)).not.toBeInTheDocument(),
    )
  })

  it("el segmento 'Capturas' oculta las notas", async () => {
    const user = userEvent.setup()
    renderWithProviders(<NotasFeedView />)

    expect(await screen.findByText(/Una cita capturada de la web/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Capturas' }))

    expect(screen.getByText(/Una cita capturada de la web/)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText(/Idea matriz sobre memoria/)).not.toBeInTheDocument(),
    )
  })

  it('el buscador es on-demand: la lupa lo expande y filtra el feed', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NotasFeedView />)

    await screen.findByText(/Idea matriz sobre memoria/)

    // En reposo el feed NO muestra una barra de búsqueda permanente.
    expect(
      screen.queryByPlaceholderText(/Buscar en notas y capturas/),
    ).not.toBeInTheDocument()

    // La lupa expande el input.
    await user.click(screen.getByRole('button', { name: 'Buscar en notas y capturas' }))
    const input = await screen.findByPlaceholderText(/Buscar en notas y capturas/)

    // Buscar algo que solo matchea la nota oculta el recorte.
    await user.type(input, 'memoria')
    await waitFor(() =>
      expect(screen.queryByText(/Una cita capturada de la web/)).not.toBeInTheDocument(),
    )
    expect(screen.getByText(/Idea matriz sobre memoria/)).toBeInTheDocument()

    // Cerrar el buscador desmonta el input y limpia la búsqueda.
    await user.click(screen.getByRole('button', { name: 'Cerrar búsqueda' }))
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText(/Buscar en notas y capturas/),
      ).not.toBeInTheDocument(),
    )
    expect(await screen.findByText(/Una cita capturada de la web/)).toBeInTheDocument()
  })

  it('el calendario de actividad está oculto por defecto y aparece tras el toggle', async () => {
    const user = userEvent.setup()
    renderWithProviders(<NotasFeedView />)

    await screen.findByText(/Idea matriz sobre memoria/)

    // No hay heatmap permanente en el tope.
    expect(screen.queryByRole('button', { name: 'Mes anterior' })).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Mostrar calendario de actividad' }),
    )
    expect(
      await screen.findByRole('button', { name: 'Mes anterior' }),
    ).toBeInTheDocument()
  })

  it('crear enlace: la tarjeta aparece y, tras el enriquecimiento OG, muestra el título', async () => {
    // Reproduce el flujo del e2e notas-capture en jsdom (virtualizer mockeado):
    // POST crea el recorte, el feed lo refleja, el enriquecimiento OG parchea el
    // título y el feed se refresca a «Artículo de ejemplo».
    const created: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.startsWith('/api/notas-feed') && method === 'GET') {
        return jsonResponse({
          items: created.map((r) => ({
            type: 'recorte',
            id: r.id,
            createdAt: r.created_at,
            recorte: r,
          })),
          nextCursor: null,
        })
      }
      if (url.startsWith('/api/notes') && method === 'GET') return jsonResponse([])
      if (url === '/api/recortes' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        const row = {
          id: 'r-1',
          text: body.text ?? '',
          source_url: body.sourceUrl ?? null,
          source_title: body.sourceTitle ?? null,
          source_author: null,
          note: null,
          image_url: null,
          image_key: null,
          capture_mode: body.captureMode ?? null,
          status: 'pending',
          promoted_target: null,
          promoted_id: null,
          captured_at: null,
          created_at: '2026-06-14T00:00:00.000Z',
          updated_at: '2026-06-14T00:00:00.000Z',
        }
        created.unshift(row)
        return jsonResponse(row, 201)
      }
      if (url.includes('/api/momentos-url-preview'))
        return jsonResponse({
          url: 'https://example.com/x',
          title: 'Artículo de ejemplo',
          description: 'Un resumen',
          author: 'Autora',
          image: null,
          fetched: true,
        })
      if (url.includes('/cache-thumbnail') && method === 'POST')
        return jsonResponse({ cached: false })
      if (/\/api\/recortes\/[^/]+$/.test(url) && method === 'PATCH') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        const r = created[0]
        if (r && body.sourceTitle != null) r.source_title = body.sourceTitle
        return jsonResponse(r)
      }
      if (url.startsWith('/api/counts') || url.startsWith('/api/home'))
        return jsonResponse({})
      throw new Error(`Fetch inesperado: ${method} ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderWithProviders(
      <>
        <NotasFeedView />
        <ToastHost />
      </>,
    )

    const composer = screen.getByPlaceholderText(/Escribe una nota/)
    await user.type(composer, 'https://example.com/x')
    await user.click(screen.getByRole('button', { name: 'Guardar enlace' }))

    expect(await screen.findByText(/Artículo de ejemplo/)).toBeInTheDocument()
  })
})
