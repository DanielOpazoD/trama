import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShortcutsModal } from './ShortcutsModal'

describe('<ShortcutsModal />', () => {
  it('no renderiza nada cuando está cerrado', () => {
    render(<ShortcutsModal open={false} onClose={() => {}} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('muestra grupos de atajos y cierra por botón, backdrop y Escape', async () => {
    const user = userEvent.setup()
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

    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await user.click(screen.getByRole('button', { name: 'Cerrar atajos' }))
    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
