import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CloseButton } from './CloseButton'

describe('<CloseButton />', () => {
  it('nombra el botón "Cerrar" por defecto y es type="button"', () => {
    render(<CloseButton onClick={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Cerrar' })
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('acepta un label más específico', () => {
    render(<CloseButton label="Cerrar vista previa" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Cerrar vista previa' })).toBeInTheDocument()
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
})
