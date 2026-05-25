/**
 * BB8: tests del focus-trap hook (BB6).
 *
 * Cubre los 3 contratos clave:
 *   1. Al activar, mueve el foco al primer focuseable del root.
 *   2. Tab desde el último ciclica al primero, Shift+Tab al revés.
 *   3. Al desactivar, restaura el foco al elemento que tenía antes.
 */

import { useRef, useState } from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

function TestModal({ active, onClose }: { active: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, active)
  if (!active) return null
  return (
    <div ref={ref} role="dialog" aria-label="modal">
      <button>first</button>
      <button>middle</button>
      <button onClick={onClose}>last</button>
    </div>
  )
}

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button data-testid="opener" onClick={() => setOpen(true)}>
        open
      </button>
      <TestModal active={open} onClose={() => setOpen(false)} />
    </>
  )
}

describe('useFocusTrap', () => {
  it('mueve el foco al primer focuseable cuando se activa', async () => {
    render(<Harness />)
    const opener = screen.getByTestId('opener')
    opener.focus()
    expect(document.activeElement).toBe(opener)

    fireEvent.click(opener)

    // El hook usa setTimeout(0) para esperar el paint. Avanzamos timers.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(document.activeElement?.textContent).toBe('first')
  })

  it('Tab desde el último ciclica al primero', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('opener'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const last = screen.getByText('last')
    last.focus()
    expect(document.activeElement).toBe(last)

    fireEvent.keyDown(document, { key: 'Tab' })

    expect(document.activeElement?.textContent).toBe('first')
  })

  it('Shift+Tab desde el primero ciclica al último', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('opener'))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const first = screen.getByText('first')
    first.focus()
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })

    expect(document.activeElement?.textContent).toBe('last')
  })

  it('restaura el foco al desactivarse', async () => {
    const { rerender } = render(<Harness />)
    const opener = screen.getByTestId('opener')
    opener.focus()
    expect(document.activeElement).toBe(opener)

    // Abrir: el foco se mueve al modal.
    fireEvent.click(opener)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(document.activeElement?.textContent).toBe('first')

    // Cerrar: click en "last" (cierra) → el cleanup del hook restaura
    // el foco al opener original.
    fireEvent.click(screen.getByText('last'))
    rerender(<Harness />)

    expect(document.activeElement).toBe(opener)
  })

  it('no hace nada cuando active=false', async () => {
    render(<Harness />)
    const opener = screen.getByTestId('opener')
    opener.focus()
    // Sin abrir el modal, el foco no debe cambiar tras un tick.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(document.activeElement).toBe(opener)
  })
})
