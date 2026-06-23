import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModalShell } from './shell'

/**
 * Tests del shell compartido de los modales de edición de momentos.
 * Tras migrar a `useModalOverlay`, lo que nos importa preservar es el
 * contrato accesible (role=dialog + aria-modal + aria-label) y el cierre
 * por Escape / backdrop — sin lógica propia de guard, igual que antes.
 */
describe('<ModalShell />', () => {
  function renderShell(onClose = vi.fn()) {
    render(
      <ModalShell
        ariaLabel="Editar nota"
        eyebrow="editar momento"
        title="Nota del día"
        onClose={onClose}
      >
        <button type="button">Acción interna</button>
      </ModalShell>,
    )
    return onClose
  }

  it('renderiza un dialog accesible con aria-modal y aria-label', () => {
    renderShell()
    const dialog = screen.getByRole('dialog', { name: 'Editar nota' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('editar momento')).toBeInTheDocument()
    expect(screen.getByText('Nota del día')).toBeInTheDocument()
  })

  it('cierra con Escape disparado en document', async () => {
    const onClose = renderShell()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  it('no cierra con otras teclas', () => {
    const onClose = renderShell()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('cierra al hacer click en el backdrop', () => {
    const onClose = renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('bloquea el scroll del body mientras está abierto y lo restaura al cerrar', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = render(
      <ModalShell
        ariaLabel="Editar nota"
        eyebrow="editar momento"
        title="Nota del día"
        onClose={vi.fn()}
      >
        <button type="button">Acción interna</button>
      </ModalShell>,
    )
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })
})
