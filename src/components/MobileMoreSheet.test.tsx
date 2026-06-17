import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileMoreSheet } from './MobileMoreSheet'

describe('<MobileMoreSheet />', () => {
  it('renderiza Más como mapa agrupado de vistas secundarias', () => {
    render(
      <MobileMoreSheet open view="grafo" onClose={() => {}} onChangeView={() => {}} />,
    )

    expect(screen.getByRole('dialog', { name: 'Más vistas' })).toBeInTheDocument()
    expect(screen.getByText('Catálogo')).toBeInTheDocument()
    expect(screen.getByText('Lentes')).toBeInTheDocument()
    expect(screen.getByText('Diálogo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Grafo' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('cierra con Escape, clic fuera y selección de vista', () => {
    const onClose = vi.fn()
    const onChangeView = vi.fn()
    const { rerender } = render(
      <MobileMoreSheet
        open
        view="inicio"
        onClose={onClose}
        onChangeView={onChangeView}
      />,
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    onClose.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar fondo' }))
    expect(onClose).toHaveBeenCalledOnce()

    onClose.mockClear()
    rerender(
      <MobileMoreSheet
        open
        view="inicio"
        onClose={onClose}
        onChangeView={onChangeView}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Atlas' }))
    expect(onChangeView).toHaveBeenCalledWith('atlas')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('restaura el foco al disparador al cerrar', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Más vistas
          </button>
          <MobileMoreSheet
            open={open}
            view="inicio"
            onClose={() => setOpen(false)}
            onChangeView={() => {}}
          />
        </>
      )
    }

    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Más vistas' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar fondo' }))

    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})
