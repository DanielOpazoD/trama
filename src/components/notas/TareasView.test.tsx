import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { TareasView } from './TareasView'

beforeEach(() => {
  // El endpoint de tareas devuelve [] — sin tareas todavía.
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

describe('<TareasView />', () => {
  it('muestra el composer y el estado vacío cuando no hay tareas', async () => {
    renderWithProviders(<TareasView />)
    expect(screen.getByPlaceholderText(/Nueva tarea/)).toBeInTheDocument()
    expect(await screen.findByText(/Nada pendiente/)).toBeInTheDocument()
  })
})
