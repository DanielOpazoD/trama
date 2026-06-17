import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAnchoredPopover } from './useAnchoredPopover'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const popover = useAnchoredPopover({ onClose })

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
})
