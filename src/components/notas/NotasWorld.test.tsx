import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { NotasWorld } from './NotasWorld'

beforeEach(() => {
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

  it('monta RecortesArea (con sus sub-pestañas) en la sección Bandeja', async () => {
    renderWithProviders(
      <NotasWorld world="notas" initialSection="bandeja" onChangeWorld={() => {}} />,
    )

    expect(screen.getAllByRole('button', { name: 'Bandeja' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getAllByText('capturas esperando curaduría').length).toBeGreaterThan(0)

    // RecortesArea conserva sus tres sub-pestañas hermanas (recortes/favoritos/mesa).
    expect(await screen.findByRole('button', { name: 'Favoritos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mesa' })).toBeInTheDocument()
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
})
