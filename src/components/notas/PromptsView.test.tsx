import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { PromptsView } from './PromptsView'

let clipboardWriteText: ReturnType<typeof vi.spyOn>

const promptRows = [
  {
    id: 'prompt-1',
    title: 'Sintetizar entrevista',
    content: 'Resume {{tema}} en tres capas.',
    collection: 'Investigación',
    tags: ['resumen'],
    variables: ['tema'],
    favorite: true,
    use_count: 7,
    last_used_at: null,
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
  },
  {
    id: 'prompt-2',
    title: 'Checklist semanal',
    content: 'Ordena tareas abiertas.',
    collection: 'Operación',
    tags: [],
    variables: [],
    favorite: false,
    use_count: 3,
    last_used_at: null,
    created_at: '2026-06-02T10:00:00.000Z',
    updated_at: '2026-06-02T10:00:00.000Z',
  },
]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubPromptsFetch(rows: unknown[] = promptRows) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url === '/api/prompts' && method === 'GET') return jsonResponse(rows)
    if (url === '/api/prompts' && method === 'POST') {
      const body = JSON.parse(String(init?.body))
      return jsonResponse({
        id: 'prompt-created',
        title: body.title,
        content: body.content,
        collection: body.collection ?? null,
        tags: [],
        variables: [],
        favorite: false,
        use_count: 0,
        last_used_at: null,
        created_at: '2026-06-03T09:00:00.000Z',
        updated_at: '2026-06-03T09:00:00.000Z',
      })
    }
    if (url === '/api/prompts/prompt-1/use' && method === 'POST') {
      return jsonResponse({ ...promptRows[0], use_count: 8 })
    }
    if (url.startsWith('/api/notas-attachments?')) return jsonResponse([])
    return jsonResponse([])
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  stubPromptsFetch()
  clipboardWriteText = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<PromptsView />', () => {
  it('muestra métricas y filtra por colección', async () => {
    const user = userEvent.setup()

    renderWithProviders(<PromptsView />)

    expect(await screen.findByText('Sintetizar entrevista')).toBeInTheDocument()
    expect(screen.getByText('Checklist semanal')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
    expect(screen.getAllByText(/usos/i).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: /Investigación/i }))
    expect(screen.getByText('Sintetizar entrevista')).toBeInTheDocument()
    expect(screen.queryByText('Checklist semanal')).not.toBeInTheDocument()
  })

  it('crea prompts con título, colección y contenido', async () => {
    const fetchMock = stubPromptsFetch([])
    const user = userEvent.setup()

    renderWithProviders(<PromptsView />)

    // Plegado en reposo: el título es la única línea; escribir despliega el resto.
    await user.type(screen.getByLabelText('Título del prompt'), 'Nuevo ritual')
    await user.type(screen.getByLabelText('Colección'), 'Diario')
    await user.type(screen.getByLabelText('Contenido del prompt'), 'Pregunta por foco')
    await user.click(screen.getByRole('button', { name: /guardar prompt/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prompts',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'Nuevo ritual',
            content: 'Pregunta por foco',
            collection: 'Diario',
          }),
        }),
      ),
    )
  })

  it('copia el contenido del prompt y marca uso', async () => {
    const fetchMock = stubPromptsFetch(promptRows)
    const user = userEvent.setup()

    renderWithProviders(<PromptsView />)

    const copyButtons = await screen.findAllByRole('button', { name: /Copiar prompt/i })
    const firstCopyButton = copyButtons[0]
    expect(firstCopyButton).toBeDefined()
    await user.click(firstCopyButton!)

    expect(clipboardWriteText).toHaveBeenCalledWith('Resume {{tema}} en tres capas.')
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prompts/prompt-1/use',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })
})
