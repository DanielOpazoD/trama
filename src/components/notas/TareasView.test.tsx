import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { TareasView } from './TareasView'
import { weekStartLocal } from './notasUtils'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function taskRow(overrides: Record<string, unknown>) {
  return {
    id: 'task-1',
    title: 'Recordatorio base',
    detail: null,
    done: false,
    due_date: null,
    priority: 'media',
    week_start: weekStartLocal(),
    category: 'trabajo',
    completed_at: null,
    has_photos: false,
    tags: [],
    created_at: '2026-06-01T10:00:00.000Z',
    updated_at: '2026-06-01T10:00:00.000Z',
    ...overrides,
  }
}

function stubTasksFetch(rows: unknown[] = []) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.startsWith('/api/tasks') && method === 'GET') return jsonResponse(rows)
    if (url === '/api/tasks' && method === 'POST') {
      const body = JSON.parse(String(init?.body))
      return jsonResponse(
        taskRow({
          id: 'task-created',
          title: body.title,
          priority: body.priority,
          week_start: body.weekStart ?? weekStartLocal(),
          category: body.category,
        }),
      )
    }
    if (url.startsWith('/api/month-notes?')) {
      const params = new URLSearchParams(url.split('?')[1])
      return jsonResponse({
        monthKey: params.get('month') ?? '2026-06',
        category: params.get('category') ?? 'trabajo',
        content: '',
      })
    }
    if (url.startsWith('/api/notas-attachments?')) return jsonResponse([])
    return jsonResponse([])
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 5, 10, 12))
  stubTasksFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('<TareasView />', () => {
  it('muestra el navegador de meses y un composer por semana', async () => {
    renderWithProviders(<TareasView />)
    // Navegador temporal: año con flechas y meses.
    expect(
      await screen.findByRole('button', { name: /año siguiente/i }),
    ).toBeInTheDocument()
    // Cada semana del mes tiene su composer con selector de prioridad.
    const inputs = await screen.findAllByPlaceholderText(/Agregar recordatorio/)
    expect(inputs.length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('radio', { name: /prioridad alta/i }).length,
    ).toBeGreaterThan(0)
  })

  it('marca la entrada de la semana actual como punto de partida claro en móvil', async () => {
    renderWithProviders(<TareasView />)

    const firstInput = (await screen.findAllByPlaceholderText(/Agregar recordatorio/))[0]
    expect(firstInput).toBeDefined()
    const composer = firstInput!.closest('[data-testid="week-composer"]')

    expect(composer).not.toBeNull()
    expect(composer?.className).toContain('min-h-[44px]')
    expect(within(composer as HTMLElement).getByText('Nueva')).toBeInTheDocument()
  })

  it('ordena la semana actual antes que las pasadas y futuras del mes', async () => {
    renderWithProviders(<TareasView />)

    const firstInput = (await screen.findAllByPlaceholderText(/Agregar recordatorio/))[0]
    const firstWeek = firstInput?.closest('article')

    expect(firstWeek).not.toBeNull()
    expect(within(firstWeek as HTMLElement).getByText('Esta semana')).toBeInTheDocument()
  })

  it('cada cuadro semanal tiene pestañas Trabajo / Personal (Trabajo por defecto)', async () => {
    renderWithProviders(<TareasView />)
    const trabajo = await screen.findAllByRole('tab', { name: /trabajo/i })
    expect(trabajo.length).toBeGreaterThan(0)
    // Trabajo es la pestaña activa por defecto (ahí quedan las tareas antiguas).
    const firstTrabajoTab = trabajo[0]
    expect(firstTrabajoTab).toBeDefined()
    expect(firstTrabajoTab!).toHaveAttribute('aria-selected', 'true')
    // Hay tantas pestañas Personal como cuadros semanales.
    expect(screen.getAllByRole('tab', { name: /personal/i })).toHaveLength(trabajo.length)
  })

  it('muestra tareas por categoría dentro de la hoja semanal activa', async () => {
    const user = userEvent.setup()
    stubTasksFetch([
      taskRow({ id: 'work-task', title: 'Revisar contrato', category: 'trabajo' }),
      taskRow({ id: 'home-task', title: 'Comprar pasajes', category: 'personal' }),
    ])

    renderWithProviders(<TareasView />)

    expect(await screen.findByText('Revisar contrato')).toBeInTheDocument()
    expect(screen.queryByText('Comprar pasajes')).not.toBeInTheDocument()

    for (const tab of screen.getAllByRole('tab', { name: /personal/i })) {
      await user.click(tab)
    }

    expect(await screen.findByText('Comprar pasajes')).toBeInTheDocument()
    expect(screen.queryByText('Revisar contrato')).not.toBeInTheDocument()
  })

  it('muestra ErrorState (no las hojas semanales vacías) cuando falla la carga', async () => {
    // El listado de tareas se rompe (500): las demás llamadas (month-notes,
    // attachments) siguen sanas. Sin la rama de error, las hojas semanales se
    // dibujarían sin recordatorios y el fallo se confundiría con un mes vacío.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.startsWith('/api/tasks')) return jsonResponse({ error: 'boom' }, 500)
        if (url.startsWith('/api/month-notes?')) {
          return jsonResponse({ monthKey: '2026-06', category: 'trabajo', content: '' })
        }
        if (url.startsWith('/api/notas-attachments?')) return jsonResponse([])
        return jsonResponse([])
      }),
    )

    renderWithProviders(<TareasView />)

    // Aparece el estado de error (ErrorState usa role="alert") con reintentar.
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudieron cargar los recordatorios')
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()

    // Y NO se montan las hojas semanales vacías (sus composers) que harían pasar
    // el fallo por "no hay recordatorios todavía".
    expect(screen.queryByPlaceholderText(/Agregar recordatorio/)).not.toBeInTheDocument()
  })

  it('crea recordatorios con prioridad y categoría de la semana', async () => {
    const fetchMock = stubTasksFetch()
    const user = userEvent.setup()

    renderWithProviders(<TareasView />)

    const inputs = await screen.findAllByPlaceholderText(/Agregar recordatorio/)
    const firstInput = inputs[0]
    expect(firstInput).toBeDefined()
    const firstWeek = firstInput!.closest('article')
    expect(firstWeek).not.toBeNull()

    await user.click(within(firstWeek!).getByRole('tab', { name: /personal/i }))
    await user.click(within(firstWeek!).getByRole('radio', { name: /prioridad alta/i }))
    await user.type(firstInput!, 'Llamar a proveedor{Enter}')

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tasks',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"title":"Llamar a proveedor"'),
        }),
      ),
    )
    const createCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === '/api/tasks' && init?.method === 'POST',
    )
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual(
      expect.objectContaining({
        title: 'Llamar a proveedor',
        priority: 'alta',
        category: 'personal',
      }),
    )
  })
})
