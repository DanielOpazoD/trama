import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { NotasView } from './NotasView'

const noteRows = [
  {
    id: 'note-1',
    content: 'Idea matriz sobre memoria #memoria',
    tags: ['memoria'],
    pinned: true,
    promoted_momento_id: null,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
    has_images: false,
  },
  {
    id: 'note-2',
    content: 'Borrador operativo #trabajo',
    tags: ['trabajo'],
    pinned: false,
    promoted_momento_id: null,
    created_at: '2026-06-02T12:00:00.000Z',
    updated_at: '2026-06-02T12:00:00.000Z',
    has_images: false,
  },
]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubNotesFetch(rows: unknown[] = []) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/notes' && (init?.method ?? 'GET') === 'GET') {
      return jsonResponse(rows)
    }
    if (url === '/api/notes' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      return jsonResponse({
        id: 'note-created',
        content: body.content,
        tags: ['captura'],
        pinned: body.pinned,
        promoted_momento_id: null,
        created_at: '2026-06-03T09:00:00.000Z',
        updated_at: '2026-06-03T09:00:00.000Z',
        has_images: false,
      })
    }
    return jsonResponse([])
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  stubNotesFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<NotasView />', () => {
  it('muestra el composer y el estado vacío cuando no hay notas', async () => {
    renderWithProviders(<NotasView />)
    expect(screen.getByPlaceholderText(/Escribe una nota/)).toBeInTheDocument()
    expect(await screen.findByText(/Tu primer apunte/)).toBeInTheDocument()
  })

  it('el composer es autoexpandible (el hook fija su altura)', () => {
    renderWithProviders(<NotasView />)
    const composer = screen.getByPlaceholderText(
      /Escribe una nota/,
    ) as HTMLTextAreaElement
    // useAutosizeTextarea fija el alto en px al montar (en vez del rows fijo).
    expect(composer.style.height).toMatch(/px$/)
  })

  it('filtra por etiqueta, búsqueda y permite volver a la lista completa', async () => {
    stubNotesFetch(noteRows)
    const user = userEvent.setup()

    renderWithProviders(<NotasView />)

    expect(await screen.findByText(/Idea matriz sobre memoria/)).toBeInTheDocument()
    expect(screen.getByText(/Borrador operativo/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /#memoria/i }))
    expect(screen.getByText(/Idea matriz sobre memoria/)).toBeInTheDocument()
    expect(screen.queryByText(/Borrador operativo/)).not.toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/Buscar en tus notas/), 'sin match')
    expect(screen.getByText(/Nada coincide con eso/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Ver todas/i }))
    expect(screen.getByText(/Idea matriz sobre memoria/)).toBeInTheDocument()
    expect(screen.getByText(/Borrador operativo/)).toBeInTheDocument()
  })

  it('guarda una nota con comando enter usando el contrato POST esperado', async () => {
    const fetchMock = stubNotesFetch()
    const user = userEvent.setup()

    renderWithProviders(<NotasView />)
    const composer = screen.getByPlaceholderText(/Escribe una nota/)

    await user.type(composer, 'Captura rápida #captura')
    await user.keyboard('{Meta>}{Enter}{/Meta}')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'Captura rápida #captura', pinned: false }),
      }),
    )
  })
})
