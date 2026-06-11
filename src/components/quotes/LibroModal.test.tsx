import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { LibroModal } from './LibroModal'
import { LaminaModal } from './LaminaModal'
import { renderWithProviders } from '../../test-utils'

/**
 * Smoke de los dos modales de Tanda 2. La composición real del libro se
 * testea en src/lib/libro/buildLibro.test.ts (ejecución completa con
 * pdf-lib); acá va el chrome: que abran, muestren sus controles y cierren.
 * El canvas de la lámina no existe en happy-dom → la vista previa cae al
 * placeholder "componiendo…", que es exactamente el camino degradado.
 */

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResp([])),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<LibroModal />', () => {
  it('muestra título editable, autor y el resumen de la edición', () => {
    renderWithProviders(<LibroModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Mi libro' })
    expect(dialog.textContent).toMatch(/florilegio como edición/i)
    expect(screen.getByDisplayValue('Florilegio')).toBeInTheDocument()
    // Sin citas, componer queda deshabilitado.
    expect(screen.getByRole('button', { name: /componer libro/ })).toBeDisabled()
  })

  it('cierra con Escape', () => {
    const onClose = vi.fn()
    renderWithProviders(<LibroModal onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('<LaminaModal />', () => {
  const INPUT = {
    text: 'El olvido es la única venganza y el único perdón',
    attribution: 'Borges',
    source: null,
    marginalia: 'me persigue',
  }

  it('muestra los tres fondos y el toggle de marginalia', async () => {
    renderWithProviders(<LaminaModal input={INPUT} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Lámina' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Papel' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Noche' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Vela' })).toBeInTheDocument()
    expect(screen.getByText(/incluir tu reflexión manuscrita/)).toBeInTheDocument()

    // Cambiar de fondo no rompe (la preview cae al placeholder en happy-dom).
    fireEvent.click(screen.getByRole('radio', { name: 'Vela' }))
    expect(screen.getByRole('radio', { name: 'Vela' })).toBeChecked()
  })

  it('cierra con Escape', () => {
    const onClose = vi.fn()
    renderWithProviders(<LaminaModal input={INPUT} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
