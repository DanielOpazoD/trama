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
})
