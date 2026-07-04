import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { NotasHomeView } from './NotasHomeView'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/notes') {
        return jsonResponse([
          {
            id: 'note-pinned',
            content: 'Nota fijada del día',
            tags: [],
            pinned: true,
            promoted_momento_id: null,
            created_at: '2026-06-01T10:00:00.000Z',
            updated_at: '2026-06-01T10:00:00.000Z',
            has_images: false,
          },
          {
            id: 'note-loose',
            content: 'Nota sin fijar',
            tags: [],
            pinned: false,
            promoted_momento_id: null,
            created_at: '2026-06-02T10:00:00.000Z',
            updated_at: '2026-06-02T10:00:00.000Z',
            has_images: false,
          },
        ])
      }
      if (url === '/api/tasks?pending=1') {
        return jsonResponse([
          {
            id: 'task-low',
            title: 'Pendiente baja',
            detail: null,
            done: false,
            due_date: null,
            priority: 'baja',
            week_start: '2026-06-01',
            category: 'trabajo',
            completed_at: null,
            has_photos: false,
            tags: [],
            created_at: '2026-06-01T10:00:00.000Z',
            updated_at: '2026-06-01T10:00:00.000Z',
          },
          {
            id: 'task-high',
            title: 'Pendiente alta',
            detail: null,
            done: false,
            due_date: null,
            priority: 'alta',
            week_start: '2026-06-01',
            category: 'trabajo',
            completed_at: null,
            has_photos: false,
            tags: [],
            created_at: '2026-06-02T10:00:00.000Z',
            updated_at: '2026-06-02T10:00:00.000Z',
          },
        ])
      }
      if (url === '/api/prompts') {
        return jsonResponse([
          {
            id: 'prompt-fav',
            title: 'Prompt favorito',
            content: 'Usar en revisión',
            collection: 'Revisión',
            tags: [],
            variables: [],
            favorite: true,
            use_count: 5,
            last_used_at: null,
            created_at: '2026-06-01T10:00:00.000Z',
            updated_at: '2026-06-01T10:00:00.000Z',
          },
        ])
      }
      return jsonResponse([])
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<NotasHomeView />', () => {
  it('resume pendientes/notas/prompts y navega desde acciones y tarjetas', async () => {
    const onNavigate = vi.fn()
    const user = userEvent.setup()

    renderWithProviders(<NotasHomeView onNavigate={onNavigate} />)

    expect(await screen.findByText('Pendiente alta')).toBeInTheDocument()
    expect(screen.getByText('Nota fijada del día')).toBeInTheDocument()
    expect(screen.getByLabelText('Tareas pendientes heredadas')).toHaveTextContent(
      /Pendiente alta/i,
    )
    expect(screen.getByLabelText('Bandeja de notas')).toHaveTextContent(/Nota sin fijar/i)
    expect(screen.getByLabelText('Bandeja de notas')).toHaveTextContent(/sin etiquetas/i)
    expect(screen.getByText('Prompt favorito')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /nueva tarea/i }))
    await user.click(screen.getByRole('button', { name: /Nota fijada del día/i }))
    await user.click(screen.getByRole('button', { name: /Prompt favorito/i }))
    await user.click(screen.getByRole('button', { name: /Tus claves, a salvo/i }))
    await user.click(screen.getByRole('button', { name: /Nota sin fijar/i }))

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'tareas')
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'notas')
    expect(onNavigate).toHaveBeenNthCalledWith(3, 'prompts')
    expect(onNavigate).toHaveBeenNthCalledWith(4, 'claves')
    expect(onNavigate).toHaveBeenNthCalledWith(5, 'notas')
  })

  it('prioriza un primer viewport operativo con captura, foco crítico y notas fijadas', async () => {
    const onNavigate = vi.fn()

    renderWithProviders(<NotasHomeView onNavigate={onNavigate} />)

    await screen.findByText('Pendiente alta')

    expect(screen.getByLabelText('Turno del día')).toHaveTextContent(/2 pendientes/i)
    expect(screen.getByLabelText('Turno del día')).toHaveTextContent(/2 heredadas/i)
    expect(screen.getByLabelText('Turno del día')).toHaveTextContent(/1 crítica/i)
    expect(screen.getByRole('button', { name: /nueva nota/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /nueva tarea/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Notas fijadas')).toHaveTextContent(
      /Nota fijada del día/i,
    )
  })

  it('en estado inicial ofrece entradas directas y acciones cómodas en mobile', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([])),
    )
    const onNavigate = vi.fn()
    const user = userEvent.setup()

    renderWithProviders(<NotasHomeView onNavigate={onNavigate} />)

    expect(
      await screen.findByText('Tu centro de trabajo está listo.'),
    ).toBeInTheDocument()

    const createNote = screen.getByRole('button', { name: /Crear nota/i })
    const createTask = screen.getByRole('button', { name: /Crear tarea/i })

    expect(createNote.className).toContain('min-h-[44px]')
    expect(createTask.className).toContain('min-h-[44px]')

    await user.click(createNote)
    await user.click(createTask)

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'notas')
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'tareas')
  })

  it('muestra una carga estable antes de declarar el inicio vacío', () => {
    const resolvers: Array<(response: Response) => void> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve)
          }),
      ),
    )

    renderWithProviders(<NotasHomeView onNavigate={vi.fn()} />)

    expect(screen.getByLabelText('Cargando inicio de Notas')).toBeInTheDocument()
    expect(screen.queryByText('Tu centro de trabajo está listo.')).toBeNull()
    expect(screen.queryByRole('button', { name: /nueva clave/i })).toBeNull()

    resolvers.forEach((resolve) => resolve(jsonResponse([])))
  })
})
