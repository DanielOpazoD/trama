import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { NotasWorld } from './NotasWorld'

const pdfStudioModule = vi.hoisted(() => ({
  loaded: vi.fn(),
}))

vi.mock('./pdfStudio/PdfStudioView', () => {
  pdfStudioModule.loaded()
  return { PdfStudioView: () => <div>PDF Studio mock</div> }
})

vi.mock('./NotasFeedView', () => ({
  NotasFeedView: () => (
    <div role="tablist" aria-label="Feed mock">
      <button type="button" role="tab">
        Capturas
      </button>
      <button type="button" role="tab">
        Favoritos
      </button>
    </div>
  ),
}))

beforeEach(() => {
  pdfStudioModule.loaded.mockClear()
  window.localStorage.clear()
  // Notas y Tareas piden sus listas al montar; devolvemos [] (vacío).
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('<NotasWorld />', () => {
  it('muestra una barra superior equivalente al mundo principal', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Inicio' }).closest('.animate-shell-topbar'),
    ).toBeNull()
    expect(screen.getAllByText('mundo notas').length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole('button', { name: 'Prompts' })[0]!)

    // Dos headings: el h1 del topbar y el h2 editorial del ViewHeader.
    expect(screen.getAllByRole('heading', { name: 'Prompts' })).toHaveLength(2)
    expect(screen.getAllByText('biblioteca reutilizable').length).toBeGreaterThan(0)
  })

  it('arranca en Inicio y navega a Tareas', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'Inicio' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Tareas' })[0]!)
    expect(screen.getAllByRole('heading', { name: 'Tareas' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('recordatorios de la semana').length).toBeGreaterThan(0)
  })

  it('respeta initialSection para abrir una sección real sin depender de localStorage', () => {
    renderWithProviders(
      <NotasWorld world="notas" initialSection="prompts" onChangeWorld={() => {}} />,
    )

    expect(screen.getAllByRole('button', { name: 'Prompts' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getAllByRole('heading', { name: 'Prompts' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('biblioteca reutilizable').length).toBeGreaterThan(0)
  })

  it('monta el feed unificado (con su control segmentado) en la sección Notas', async () => {
    renderWithProviders(
      <NotasWorld world="notas" initialSection="notas" onChangeWorld={() => {}} />,
    )

    expect(screen.getAllByRole('button', { name: 'Notas' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )

    // El feed expone el control segmentado Todo · Escritas · Capturas · Favoritos.
    expect(await screen.findByRole('tab', { name: 'Capturas' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Favoritos' })).toBeInTheDocument()
  })

  it('monta con una sección oculta sin romper (regresión TDZ en producción)', () => {
    // El espejo de prefs hidrata SÍNCRONO en el primer render: con un módulo
    // oculto, el filter de secciones evalúa `s.id === section` en ese mismo
    // render. Antes del fix, `section` se declaraba después del filter →
    // ReferenceError ("Cannot access 'section' before initialization").
    window.localStorage.setItem(
      'trama:user-prefs',
      JSON.stringify({ owner: null, prefs: { visibleModules: { claves: false } } }),
    )
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument()
    // La sección oculta no aparece en el nav; el resto sí.
    expect(screen.queryByRole('button', { name: 'Claves' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Notas' }).length).toBeGreaterThan(0)
  })

  it('no muestra controles de modo cómodo ni compacto', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    expect(screen.queryByRole('button', { name: 'Modo cómodo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Modo compacto' })).toBeNull()
    expect(screen.getByTestId('notas-world-content')).toHaveClass('max-w-5xl')
  })

  it('permite colapsar y volver a expandir la barra lateral de Notas', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Colapsar barra de Notas' }))

    expect(
      screen.getByRole('button', { name: 'Expandir barra de Notas' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expandir barra de Notas' }))

    expect(
      screen.getByRole('button', { name: 'Colapsar barra de Notas' }),
    ).toBeInTheDocument()
  })

  it('abre el buscador global como diálogo modal y lo cierra con Escape', async () => {
    // El buscador global usa useModalOverlay: rol de diálogo + cierre por el
    // stack de overlays (Escape). Antes el Escape era un listener propio; ahora
    // lo delega al hook, que además atrapa el foco y restaura al cerrar.
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    expect(screen.queryByRole('dialog', { name: 'Buscar en Notas' })).toBeNull()

    // El trigger por defecto es el botón "Buscar…" del sidebar expandido; el
    // diálogo (aria-label "Buscar en Notas") es lo que abre. El icon-button
    // "Buscar en Notas" solo existe con el sidebar colapsado.
    fireEvent.click(screen.getAllByRole('button', { name: 'Buscar en Notas' })[0]!)

    const dialog = await screen.findByRole('dialog', { name: 'Buscar en Notas' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Buscar en Notas' })).toBeNull(),
    )
  })

  it('precarga PDF Studio por intención sobre Imprenta sin montarlo al iniciar', async () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    expect(pdfStudioModule.loaded).not.toHaveBeenCalled()
    fireEvent.mouseEnter(screen.getAllByRole('button', { name: 'Imprenta' })[0]!)

    await waitFor(() => expect(pdfStudioModule.loaded).toHaveBeenCalled())
  })
})
