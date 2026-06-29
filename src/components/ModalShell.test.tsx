import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModalShell, ModalFooter } from './ModalShell'

describe('<ModalShell />', () => {
  it('renderiza un dialog accesible con su aria-label y los children', () => {
    render(
      <ModalShell ariaLabel="Editar cita" onClose={() => {}}>
        <p>cuerpo del modal</p>
      </ModalShell>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Editar cita' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('cuerpo del modal')).toBeInTheDocument()
  })

  it('muestra eyebrow + title cuando se pasan', () => {
    render(
      <ModalShell
        ariaLabel="x"
        eyebrow="editar cita"
        title="Refinar el fragmento"
        onClose={() => {}}
      >
        <p>c</p>
      </ModalShell>,
    )
    expect(screen.getByText('editar cita')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Refinar el fragmento' }),
    ).toBeInTheDocument()
  })

  it('no renderiza header si no hay eyebrow/title/showClose (solo el backdrop es "Cerrar")', () => {
    render(
      <ModalShell ariaLabel="x" onClose={() => {}}>
        <p>c</p>
      </ModalShell>,
    )
    // Único botón "Cerrar" = el backdrop; no hay X de header.
    expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(1)
  })

  it('showClose agrega la X del header (dos disparadores de cierre: backdrop + X)', () => {
    render(
      <ModalShell ariaLabel="x" title="t" showClose onClose={() => {}}>
        <p>c</p>
      </ModalShell>,
    )
    expect(screen.getAllByRole('button', { name: 'Cerrar' })).toHaveLength(2)
  })

  it('click en el backdrop llama onClose', () => {
    const onClose = vi.fn()
    render(
      <ModalShell ariaLabel="x" onClose={onClose}>
        <p>c</p>
      </ModalShell>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Escape llama onClose (delegado a useModalOverlay)', () => {
    const onClose = vi.fn()
    render(
      <ModalShell ariaLabel="x" onClose={onClose}>
        <p>c</p>
      </ModalShell>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('size mapea a la clase de ancho del diálogo', () => {
    const { rerender } = render(
      <ModalShell ariaLabel="x" onClose={() => {}}>
        <p>c</p>
      </ModalShell>,
    )
    expect(screen.getByRole('dialog')).toHaveClass('max-w-xl') // md por defecto
    rerender(
      <ModalShell ariaLabel="x" size="sm" onClose={() => {}}>
        <p>c</p>
      </ModalShell>,
    )
    expect(screen.getByRole('dialog')).toHaveClass('max-w-md')
  })

  it('usa z-index semánticos (overlay para backdrop, modal para diálogo)', () => {
    render(
      <ModalShell ariaLabel="x" onClose={() => {}}>
        <p>c</p>
      </ModalShell>,
    )
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveClass('z-overlay')
    expect(screen.getByRole('dialog').parentElement).toHaveClass('z-modal')
  })
})

describe('<ModalFooter />', () => {
  it('renderiza las acciones que recibe', () => {
    render(
      <ModalFooter>
        <button type="button">cancelar</button>
        <button type="button">guardar</button>
      </ModalFooter>,
    )
    expect(screen.getByRole('button', { name: 'cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'guardar' })).toBeInTheDocument()
  })
})
