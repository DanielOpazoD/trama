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
    if (url.startsWith('/api/tasks/') && method === 'PATCH') {
      const body = JSON.parse(String(init?.body))
      const { weekStart, dueDate, ...rest } = body
      return jsonResponse(
        taskRow({
          id: url.split('/').pop(),
          ...rest,
          ...(weekStart !== undefined ? { week_start: weekStart } : {}),
          ...(dueDate !== undefined ? { due_date: dueDate } : {}),
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

  /**
   * El orden es UN estado de la vista, así que su control aparece UNA vez.
   * Antes se renderizaba dentro de la cabecera de cada cuadro semanal —4-5
   * copias idénticas— y cambiarlo en una semana reordenaba silenciosamente
   * todas las demás, aunque el menú se leía junto a una semana concreta.
   */
  it('el control de orden aparece una sola vez, no uno por semana', async () => {
    renderWithProviders(<TareasView />)

    // Varias hojas semanales en pantalla…
    const semanas = await screen.findAllByRole('article')
    expect(semanas.length).toBeGreaterThan(1)

    // …y un único control de orden para todas.
    const ordenar = screen.getAllByRole('button', { name: /^Ordenar —/ })
    expect(ordenar).toHaveLength(1)
  })

  it('el orden vive fuera de las hojas semanales', async () => {
    renderWithProviders(<TareasView />)

    const ordenar = await screen.findByRole('button', { name: /^Ordenar —/ })
    // Si estuviera dentro de una hoja, se leería como "ordenar esta semana".
    expect(ordenar.closest('article')).toBeNull()
  })

  it('el menú de orden anuncia el criterio activo y lo cambia', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TareasView />)

    const ordenar = await screen.findByRole('button', {
      name: /^Ordenar — Fecha de ingreso$/,
    })
    await user.click(ordenar)
    await user.click(screen.getByRole('menuitem', { name: /Prioridad/ }))

    expect(
      screen.getByRole('button', { name: /^Ordenar — Prioridad$/ }),
    ).toBeInTheDocument()
  })

  /**
   * El criterio activo se lee SIN hover ni abrir el menú: como el orden vale
   * para toda la hoja mensual, su estado tiene que estar a la vista. Un icono
   * suelto obligaría a abrir el menú para saber cómo está ordenado — y sería
   * además el único `action` de cabecera solo-icono de la app (Citas y Claves
   * usan texto).
   */
  it('el criterio activo se lee sin abrir el menú', async () => {
    renderWithProviders(<TareasView />)

    const ordenar = await screen.findByRole('button', { name: /^Ordenar —/ })
    expect(ordenar).toHaveTextContent('Fecha de ingreso')
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

  it('arrastra pendientes no resueltos al primer cuadro cuando se navega a un mes futuro', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const fetchMock = stubTasksFetch([
      taskRow({
        id: 'carry-june',
        title: 'Renovar permiso',
        week_start: '2026-06-01',
        created_at: '2026-06-01T10:00:00.000Z',
      }),
    ])

    renderWithProviders(<TareasView />)

    expect(await screen.findByText('Renovar permiso')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /mes jul/i }))

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).includes(
            '/api/tasks?weekFrom=2026-07-06&weekTo=2026-07-27&carryBefore=2026-07-06',
          ),
        ),
      ).toBe(true),
    )

    const julyWeek = await screen.findByText('6 – 12 de julio')
    const julyArticle = julyWeek.closest('article')
    expect(julyArticle).not.toBeNull()
    expect(
      within(julyArticle as HTMLElement).getByText('Renovar permiso'),
    ).toBeInTheDocument()
  })

  it('al completar un pendiente heredado en mes futuro lo fija en la semana visible', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const fetchMock = stubTasksFetch([
      taskRow({
        id: 'carry-june',
        title: 'Renovar permiso',
        week_start: '2026-06-01',
      }),
    ])

    renderWithProviders(<TareasView />)

    await screen.findByText('Renovar permiso')
    await user.click(screen.getByRole('button', { name: /mes jul/i }))
    const julyWeek = await screen.findByText('6 – 12 de julio')
    const julyArticle = julyWeek.closest('article')
    expect(julyArticle).not.toBeNull()

    await user.click(
      within(julyArticle as HTMLElement).getByRole('checkbox', {
        name: /marcar como hecha/i,
      }),
    )

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url, init]) => {
          if (String(url) !== '/api/tasks/carry-june' || init?.method !== 'PATCH') {
            return false
          }
          return String(init.body).includes('"weekStart":"2026-07-06"')
        }),
      ).toBe(true),
    )
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
