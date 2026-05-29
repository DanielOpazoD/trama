import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { NotasWorld } from './NotasWorld'

beforeEach(() => {
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
})

describe('<NotasWorld />', () => {
  it('arranca en Notas y cambia a Tareas', () => {
    renderWithProviders(<NotasWorld world="notas" onChangeWorld={() => {}} />)
    // Eyebrow de la sección Notas (único en el header).
    expect(screen.getByText('apuntes rápidos')).toBeInTheDocument()

    // Hay dos botones "Tareas" (sub-barra desktop + tabs mobile, ambos en el
    // DOM bajo jsdom); el primero alcanza para disparar el cambio.
    fireEvent.click(screen.getAllByRole('button', { name: 'Tareas' })[0]!)
    expect(screen.getByText('por realizar')).toBeInTheDocument()
  })
})
