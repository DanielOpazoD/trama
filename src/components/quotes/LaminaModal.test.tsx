import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { LaminaModal } from './LaminaModal'
import { renderWithProviders } from '../../test-utils'

/**
 * Smoke de la Lámina (chrome del modal): que abra, muestre sus controles,
 * se monte en body y cierre. La composición real de la imagen vive en
 * src/lib/lamina; acá no se ejercita el canvas. El canvas no existe en
 * happy-dom → la vista previa cae al placeholder "componiendo…", que es
 * exactamente el camino degradado.
 *
 * Migrado a useModalOverlay: el diálogo es aria-modal y Escape se escucha
 * en document (capture), no en window.
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
  vi.useRealTimers()
})

describe('<LaminaModal />', () => {
  const INPUT = {
    text: 'El olvido es la única venganza y el único perdón',
    attribution: 'Borges',
    source: null,
    marginalia: 'me persigue',
  }

  it('es un diálogo aria-modal con los tres fondos y el toggle de marginalia', async () => {
    renderWithProviders(<LaminaModal input={INPUT} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Lámina' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('radio', { name: 'Papel' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Noche' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Vela' })).toBeInTheDocument()
    expect(screen.getByText(/incluir tu reflexión manuscrita/)).toBeInTheDocument()

    // Cambiar de fondo no rompe (la preview cae al placeholder en happy-dom).
    fireEvent.click(screen.getByRole('radio', { name: 'Vela' }))
    expect(screen.getByRole('radio', { name: 'Vela' })).toBeChecked()
  })

  it('se monta en body para no quedar atrapada por contenedores transformados', () => {
    renderWithProviders(
      <div style={{ transform: 'translateY(10px)' }}>
        <LaminaModal input={INPUT} onClose={() => {}} />
      </div>,
    )

    expect(screen.getByRole('dialog', { name: 'Lámina' }).parentElement).toBe(
      document.body,
    )
  })

  it('cierra con Escape', () => {
    const onClose = vi.fn()
    renderWithProviders(<LaminaModal input={INPUT} onClose={onClose} />)
    // useModalOverlay escucha keydown en document (capture).
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
