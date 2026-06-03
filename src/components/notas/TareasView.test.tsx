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

  it('cada cuadro semanal tiene pestañas Trabajo / Personal (Trabajo por defecto)', async () => {
    renderWithProviders(<TareasView />)
    const trabajo = await screen.findAllByRole('tab', { name: /trabajo/i })
    expect(trabajo.length).toBeGreaterThan(0)
    // Trabajo es la pestaña activa por defecto (ahí quedan las tareas antiguas).
    expect(trabajo[0]).toHaveAttribute('aria-selected', 'true')
    // Hay tantas pestañas Personal como cuadros semanales.
    expect(screen.getAllByRole('tab', { name: /personal/i })).toHaveLength(trabajo.length)
  })
})
