import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { NotasFeedView } from './NotasFeedView'

// compressImage usa canvas/Image, que happy-dom no implementa; lo neutralizamos
// para probar el cableado de captura por pegado sin colgar en la carga de Image.
vi.mock('../momentos/helpers', async (importActual) => {
  const actual = await importActual<typeof import('../momentos/helpers')>()
  return { ...actual, compressImage: vi.fn(async (f: File) => f) }
})

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

function stubFeedFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.startsWith('/api/notes') && method === 'GET') return jsonResponse(noteRows)
    if (url.startsWith('/api/recortes') && method === 'GET')
      return jsonResponse(recorteRows)
    if (url.includes('recortes-image-upload') && method === 'POST')
      return jsonResponse({ imageKey: 'u/shot.webp', mime: 'image/webp', size: 99 })
    if (url === '/api/recortes' && method === 'POST')
      return jsonResponse({ ...recorteRows[0], id: 'nuevo', capture_mode: 'image' }, 201)
    throw new Error(`Fetch inesperado en NotasFeedView.test: ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
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

  it('al pegar una imagen, la captura como recorte (sube y crea)', async () => {
    const fetchMock = stubFeedFetch()
    renderWithProviders(<NotasFeedView />)

    const composer = screen.getByPlaceholderText(/Escribe una nota/)
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.paste(composer, {
      clipboardData: { files: [file], getData: () => '' },
    })

    // Sube la imagen y luego crea el recorte con la imageKey resultante.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes('recortes-image-upload')),
      ).toBe(true),
    )
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, init]) => String(u) === '/api/recortes' && init?.method === 'POST',
        ),
      ).toBe(true),
    )
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
})
