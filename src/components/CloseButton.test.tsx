import { createRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { CloseButton } from './CloseButton'
import { Tooltip } from './Tooltip'

describe('<CloseButton />', () => {
  it('nombra el botón "Cerrar" por defecto y es type="button"', () => {
    render(<CloseButton onClick={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Cerrar' })
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('acepta un label más específico', () => {
    render(<CloseButton label="Cerrar vista previa" onClick={() => {}} />)
    expect(
      screen.getByRole('button', { name: 'Cerrar vista previa' }),
    ).toBeInTheDocument()
  })

  it('reenvía onClick y className, sin imponer foco propio', () => {
    const onClick = vi.fn()
    render(<CloseButton onClick={onClick} className="absolute right-5 top-5" />)
    const btn = screen.getByRole('button', { name: 'Cerrar' })
    expect(btn).toHaveClass('absolute', 'right-5', 'top-5')
    expect(btn.className).not.toMatch(/focus-visible|ring-/)
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('respeta disabled', () => {
    const onClick = vi.fn()
    render(<CloseButton onClick={onClick} disabled />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('reenvía la ref al <button> nativo', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<CloseButton ref={ref} onClick={() => {}} />)
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Cerrar' }))
  })

  // Regresión EntityHeader: Tooltip clona su child y le inyecta un ref para
  // medir dónde posicionarse; si CloseButton no la reenvía al <button>, el
  // tooltip no abre NUNCA (show() sale temprano con triggerRef null) y React
  // avisa "Function components cannot be given refs" en consola.
  it('abre el Tooltip que lo envuelve al hacer hover', () => {
    vi.useFakeTimers()
    try {
      render(
        <Tooltip content="Cerrar panel" delayMs={100}>
          <CloseButton onClick={() => {}} />
        </Tooltip>,
      )
      const btn = screen.getByRole('button', { name: 'Cerrar' })
      act(() => {
        fireEvent.mouseEnter(btn)
      })
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(screen.getByRole('tooltip')).toHaveTextContent('Cerrar panel')
    } finally {
      vi.useRealTimers()
    }
  })
})
