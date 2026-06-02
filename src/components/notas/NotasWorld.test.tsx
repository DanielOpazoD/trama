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
  it('arranca en Inicio y navega a Tareas', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'Inicio' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Tareas' })[0]!)
    expect(screen.getByText('por realizar')).toBeInTheDocument()
  })

  it('permite alternar densidad compacta y la recuerda', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)

    const compactButton = screen.getByRole('button', { name: 'Modo compacto' })
    fireEvent.click(compactButton)

    expect(screen.getByTestId('notas-world-content')).toHaveClass('max-w-6xl')
    expect(window.localStorage.getItem('trama.notas.density')).toBe('compact')
  })
})
