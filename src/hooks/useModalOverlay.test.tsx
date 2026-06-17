import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useModalOverlay } from './useModalOverlay'

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const overlay = useModalOverlay({
    open,
    onClose: () => {
      onClose()
      setOpen(false)
    },
  })

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir modal
      </button>
      {open && (
        <div ref={overlay.dialogRef} role="dialog" aria-label="Modal de prueba">
          <button type="button">Acción interna</button>
        </div>
      )}
    </>
  )
}

describe('useModalOverlay', () => {
  it('locks body scroll, closes on Escape and restores focus on close', async () => {
    const onClose = vi.fn()
    document.body.style.overflow = 'auto'

    render(<Harness onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'Abrir modal' })
    trigger.focus()

    fireEvent.click(trigger)

    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getByRole('dialog', { name: 'Modal de prueba' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Modal de prueba' }),
      ).not.toBeInTheDocument()
    })
    expect(onClose).toHaveBeenCalledOnce()
    expect(document.body.style.overflow).toBe('auto')
    expect(document.activeElement).toBe(trigger)
  })
})
