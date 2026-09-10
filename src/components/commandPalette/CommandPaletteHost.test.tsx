import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPaletteHost } from './CommandPaletteHost'

const m = vi.hoisted(() => ({
  toast: vi.fn(),
  load: vi.fn(),
}))

vi.mock('../../state', () => ({ useToast: () => ({ show: m.toast }) }))
vi.mock('./loadCommandPalette', () => ({ loadCommandPalette: () => m.load() }))

function PaletaFalsa() {
  return <div role="dialog" aria-label="Buscar" />
}

const props = { onNavigate: vi.fn(), onSelectEntity: vi.fn() }

beforeEach(() => {
  m.toast.mockReset()
  m.load.mockReset()
  // El ErrorBoundary reporta el fallo; sin backend, que no ensucie la salida.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}'))),
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('CommandPaletteHost', () => {
  it('cerrado no baja la paleta', () => {
    render(<CommandPaletteHost open={false} onClose={vi.fn()} {...props} />)
    expect(m.load).not.toHaveBeenCalled()
  })

  it('si la paleta no baja, avisa y se cierra sin tumbar la app; al reabrir lo intenta de nuevo', async () => {
    m.load
      .mockReturnValueOnce(Promise.reject(new Error('sin red')))
      .mockReturnValueOnce(Promise.resolve({ default: PaletaFalsa }))
    const onClose = vi.fn()
    const { rerender } = render(<CommandPaletteHost open onClose={onClose} {...props} />)

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(m.toast).toHaveBeenCalledTimes(1)
    expect(m.toast).toHaveBeenCalledWith({
      message: 'No se pudo abrir el buscador.',
      tone: 'error',
    })
    expect(screen.queryByText(/La trama se rompió/)).toBeNull()

    rerender(<CommandPaletteHost open={false} onClose={onClose} {...props} />)
    rerender(<CommandPaletteHost open onClose={onClose} {...props} />)
    expect(await screen.findByRole('dialog', { name: 'Buscar' })).toBeInTheDocument()
    expect(m.load).toHaveBeenCalledTimes(2)
  })
})
