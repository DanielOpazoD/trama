import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
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

function PortalOverlay({
  label,
  onClose,
  open,
}: {
  label: string
  onClose: () => void
  open: boolean
}) {
  const overlay = useModalOverlay({ open, onClose })
  if (!open) return null
  return createPortal(
    <div ref={overlay.dialogRef} role="dialog" aria-label={label}>
      <button type="button">Acción interna</button>
    </div>,
    document.body,
  )
}

function StackHarness() {
  const [baseOpen, setBaseOpen] = useState(false)
  const [topOpen, setTopOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setBaseOpen(true)}>
        Abrir base
      </button>
      <button type="button" onClick={() => setTopOpen(true)}>
        Abrir superior
      </button>
      <PortalOverlay
        label="Overlay base"
        open={baseOpen}
        onClose={() => setBaseOpen(false)}
      />
      <PortalOverlay
        label="Overlay superior"
        open={topOpen}
        onClose={() => setTopOpen(false)}
      />
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

  it('leaves non-Escape keyboard shortcuts to the owning overlay', () => {
    const onClose = vi.fn()

    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }))

    fireEvent.keyDown(document, { key: 'ArrowRight' })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Modal de prueba' })).toBeInTheDocument()
  })

  it('keeps portaled overlays stacked and restores scroll lock after the last one closes', async () => {
    document.body.style.overflow = 'auto'

    render(<StackHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir base' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir superior' }))

    expect(screen.getByRole('dialog', { name: 'Overlay base' }).parentElement).toBe(
      document.body,
    )
    expect(screen.getByRole('dialog', { name: 'Overlay superior' }).parentElement).toBe(
      document.body,
    )
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Overlay superior' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByRole('dialog', { name: 'Overlay base' })).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Overlay base' }),
      ).not.toBeInTheDocument()
    })
    expect(document.body.style.overflow).toBe('auto')
  })
})
