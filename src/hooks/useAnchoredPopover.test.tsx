import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAnchoredPopover } from './useAnchoredPopover'

function Harness({
  onClose = () => {},
  options,
}: {
  onClose?: () => void
  options?: Parameters<typeof useAnchoredPopover>[0]
}) {
  const popover = useAnchoredPopover({ ...options, onClose })

  return (
    <>
      <button
        ref={popover.triggerRef}
        type="button"
        aria-label="Abrir menú"
        onClick={popover.toggle}
      >
        abrir
      </button>
      {popover.open && popover.position && (
        <div ref={popover.layerRef} role="menu" style={popover.position}>
          <button role="menuitem">Acción</button>
        </div>
      )}
    </>
  )
}

describe('useAnchoredPopover', () => {
  it('repositions on reflow without closing the layer', () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    fireEvent.scroll(window)

    expect(screen.getByRole('menuitem', { name: 'Acción' })).toBeInTheDocument()
  })

  it('closes on outside click and Escape', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    fireEvent.mouseDown(document.body)

    expect(screen.queryByRole('menuitem', { name: 'Acción' })).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menuitem', { name: 'Acción' })).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('can anchor left while clamping to viewport bounds', () => {
    render(
      <Harness
        options={{
          horizontal: 'left',
          layerWidth: 240,
          viewportMargin: 12,
        }}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Abrir menú' })
    trigger.getBoundingClientRect = () =>
      ({
        bottom: 40,
        left: 900,
        right: 930,
        top: 10,
      }) as DOMRect
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })

    fireEvent.click(trigger)

    const menu = screen.getByRole('menu')
    expect(menu).toHaveStyle({ left: '748px', top: '46px' })
  })
})
