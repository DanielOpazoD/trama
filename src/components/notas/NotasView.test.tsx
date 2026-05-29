import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { NotasView } from './NotasView'

beforeEach(() => {
  // El endpoint de notas devuelve [] — sin notas todavía.
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

describe('<NotasView />', () => {
  it('muestra el composer y el estado vacío cuando no hay notas', async () => {
    renderWithProviders(<NotasView />)
    expect(screen.getByPlaceholderText(/Escribe una nota/)).toBeInTheDocument()
    expect(await screen.findByText(/Tu primer apunte/)).toBeInTheDocument()
  })
})
