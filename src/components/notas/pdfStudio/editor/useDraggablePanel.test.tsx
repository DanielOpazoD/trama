import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useDraggablePanel } from './useDraggablePanel'

function Probe() {
  const { panelStyle, startPanelDrag } = useDraggablePanel()
  return (
    <div data-draggable-panel data-testid="panel" style={panelStyle}>
      <div data-testid="handle" onPointerDown={startPanelDrag}>
        mover
        <button type="button">Eliminar</button>
      </div>
    </div>
  )
}

function mockPanelRect() {
  const panel = screen.getByTestId('panel')
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
    left: 700,
    top: 100,
    width: 272,
    height: 300,
    right: 972,
    bottom: 400,
    x: 700,
    y: 100,
    toJSON: () => ({}),
  })
}

describe('useDraggablePanel', () => {
  it('arrastra el panel desde el handle y conserva el offset al soltar', () => {
    render(<Probe />)
    mockPanelRect()
    const handle = screen.getByTestId('handle')

    fireEvent.pointerDown(handle, { button: 0, clientX: 750, clientY: 110 })
    fireEvent.pointerMove(window, { clientX: 650, clientY: 210 })
    fireEvent.pointerUp(window)

    expect(screen.getByTestId('panel').style.transform).toBe('translate(-100px, 100px)')

    // Al soltar deja de seguir el puntero.
    fireEvent.pointerMove(window, { clientX: 0, clientY: 0 })
    expect(screen.getByTestId('panel').style.transform).toBe('translate(-100px, 100px)')
  })

  it('acota el arrastre a la ventana (no se pierde fuera de pantalla)', () => {
    render(<Probe />)
    mockPanelRect()
    const handle = screen.getByTestId('handle')

    fireEvent.pointerDown(handle, { button: 0, clientX: 750, clientY: 110 })
    fireEvent.pointerMove(window, { clientX: -5000, clientY: -5000 })
    fireEvent.pointerUp(window)

    // left mínimo = margen 8 → offset x = 8 - 700 = -692; top igual: 8 - 100 = -92.
    expect(screen.getByTestId('panel').style.transform).toBe('translate(-692px, -92px)')
  })

  it('no arrastra desde los controles del handle', () => {
    render(<Probe />)
    mockPanelRect()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Eliminar' }), {
      button: 0,
      clientX: 750,
      clientY: 110,
    })
    fireEvent.pointerMove(window, { clientX: 600, clientY: 300 })
    fireEvent.pointerUp(window)

    expect(screen.getByTestId('panel').style.transform).toBe('')
  })
})
