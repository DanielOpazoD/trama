import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShortcutsModal } from './ShortcutsModal'

describe('<ShortcutsModal />', () => {
  it('no renderiza nada cuando está cerrado', () => {
    render(<ShortcutsModal open={false} onClose={() => {}} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('expone el diálogo como modal accesible', () => {
    render(<ShortcutsModal open onClose={() => {}} />)

    const dialog = screen.getByRole('dialog', { name: 'Atajos de teclado' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('muestra grupos de atajos y cierra por botón, backdrop y Escape', () => {
    const onClose = vi.fn()

    render(<ShortcutsModal open onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: 'Atajos de teclado' })).toBeInTheDocument()
    expect(screen.getByText('Navegación')).toBeInTheDocument()
    expect(screen.getByText('Buscar entidades, citas, ir a sección')).toBeInTheDocument()
    expect(screen.getByText('Captura rápida')).toBeInTheDocument()
    expect(screen.getByText('Imprenta · páginas')).toBeInTheDocument()
    expect(screen.getByText('Copiar páginas marcadas')).toBeInTheDocument()
    expect(screen.getByText('Imprenta · edición')).toBeInTheDocument()
    expect(screen.getByText('Copiar cuadro o imagen seleccionada')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar atajos' }))
    // Escape lo intercepta useModalOverlay con un listener en `document`
    // (capture), no sobre el window del componente como antes.
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
