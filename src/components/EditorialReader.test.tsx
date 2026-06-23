import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EditorialReader } from './EditorialReader'

describe('<EditorialReader />', () => {
  it('no renderiza nada cuando open=false', () => {
    const { container } = render(
      <EditorialReader open={false} onClose={() => {}} markdown="# Hola" />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el título y el contenido cuando está abierto', () => {
    render(
      <EditorialReader
        open
        onClose={() => {}}
        title="Borrador"
        markdown={'# Tesis\n\nUn párrafo de prueba.'}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Borrador' })
    expect(dialog).toBeInTheDocument()
    // El primitivo useModalOverlay exige aria-modal para los lectores de pantalla.
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Un párrafo de prueba.')).toBeInTheDocument()
  })

  it('cierra con Escape (en document) y con el botón', () => {
    const onClose = vi.fn()
    render(<EditorialReader open onClose={onClose} markdown="# X" />)
    // Escape lo gestiona useModalOverlay: listener en captura sobre document.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /cerrar lectura/i }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
