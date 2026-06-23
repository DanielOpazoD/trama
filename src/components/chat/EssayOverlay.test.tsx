/**
 * Tests del EssayOverlay — la página tipografiada a pantalla completa que
 * sirve respuestas largas del assistant ("abrir como ensayo").
 *
 * Foco tras la migración a useModalOverlay:
 *  - Es un diálogo modal accesible (role="dialog" + aria-modal).
 *  - Escape (escuchado en document, vía el hook) cierra.
 *  - El botón "Cerrar" dispara onClose.
 *  - El contenido se parte en párrafos por línea en blanco.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EssayOverlay } from './EssayOverlay'

describe('EssayOverlay', () => {
  it('renders an accessible modal dialog with title and paragraphs', () => {
    render(
      <EssayOverlay
        content={'Primer párrafo.\n\nSegundo párrafo.'}
        title="Sobre la memoria"
        onClose={() => {}}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Ensayo' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    expect(screen.getByRole('heading', { name: 'Sobre la memoria' })).toBeInTheDocument()
    expect(screen.getByText('Primer párrafo.')).toBeInTheDocument()
    expect(screen.getByText('Segundo párrafo.')).toBeInTheDocument()
  })

  it('closes on Escape (listened on document via useModalOverlay)', () => {
    const onClose = vi.fn()
    render(<EssayOverlay content="Cuerpo del ensayo largo." onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes when the Cerrar button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<EssayOverlay content="Cuerpo del ensayo largo." onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('omits the heading when no title is provided', () => {
    render(
      <EssayOverlay content="Solo cuerpo, sin título." title={null} onClose={() => {}} />,
    )

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getByText('Solo cuerpo, sin título.')).toBeInTheDocument()
  })
})
