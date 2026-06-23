import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MomentoQRModal } from './MomentoQRModal'

/**
 * Smoke tests para MomentoQRModal tras adoptar useModalOverlay.
 *
 * Foco: contrato de modal accesible (role=dialog + aria-modal) y los
 * caminos de cierre observables (Escape en document, click en backdrop,
 * botón cerrar). No verificamos el SVG del QR — `qrcode` se importa
 * dinámicamente y se mockea para evitar trabajo async irrelevante.
 */

// Mock del import dinámico `qrcode`. Devolvemos un SVG mínimo sincrónico
// para que el effect de generación no haga trabajo real ni deje promesas
// colgando entre tests.
vi.mock('qrcode', () => ({
  toString: vi.fn(async () => '<svg data-testid="qr-svg"></svg>'),
}))

describe('<MomentoQRModal />', () => {
  it('does not render when open=false', () => {
    render(<MomentoQRModal open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders with role="dialog" + aria-modal cuando open', () => {
    render(<MomentoQRModal open onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Escanear y subir foto')).toBeInTheDocument()
  })

  it('cierra con Escape (keydown en document)', () => {
    const onClose = vi.fn()
    render(<MomentoQRModal open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('cierra al hacer click en el backdrop', () => {
    const onClose = vi.fn()
    render(<MomentoQRModal open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('cierra con el botón "cerrar" del footer', () => {
    const onClose = vi.fn()
    render(<MomentoQRModal open onClose={onClose} />)
    // Hay dos elementos con nombre accesible relacionado a cerrar: el
    // backdrop (aria-label "Cerrar") y el botón footer (texto "cerrar").
    // Tomamos el footer por su texto visible.
    const buttons = screen.getAllByRole('button', { name: /cerrar/i })
    const footerClose = buttons.find((b) => b.textContent?.trim() === 'cerrar')
    fireEvent.click(footerClose!)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
