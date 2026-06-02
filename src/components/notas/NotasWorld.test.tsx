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
    expect(screen.getAllByText('mundo notas').length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByRole('button', { name: 'Prompts' })[0]!)

    expect(screen.getAllByRole('heading', { name: 'Prompts' })).toHaveLength(1)
    expect(screen.getAllByText('biblioteca reutilizable').length).toBeGreaterThan(0)
  })

  it('arranca en Inicio y navega a Tareas', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'Inicio' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Tareas' })[0]!)
    expect(screen.getByRole('heading', { name: 'Tareas' })).toBeInTheDocument()
    expect(screen.getByText('recordatorios de la semana')).toBeInTheDocument()
  })

  it('no muestra controles de modo cómodo ni compacto', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    expect(screen.queryByRole('button', { name: 'Modo cómodo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Modo compacto' })).toBeNull()
    expect(screen.getByTestId('notas-world-content')).toHaveClass('max-w-5xl')
  })
})
