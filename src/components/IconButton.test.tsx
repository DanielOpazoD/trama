import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IconButton } from './IconButton'

describe('<IconButton />', () => {
  it('expone el label como nombre accesible y renderiza el ícono', () => {
    render(
      <IconButton label="Cerrar">
        <svg data-testid="icono" />
      </IconButton>,
    )
    const btn = screen.getByRole('button', { name: 'Cerrar' })
    expect(btn).toBeInTheDocument()
    expect(screen.getByTestId('icono')).toBeInTheDocument()
  })

  it('es type="button" por defecto (no envía formularios sin querer)', () => {
    render(<IconButton label="X">i</IconButton>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('permite override de type', () => {
    render(
      <IconButton label="Enviar" type="submit">
        i
      </IconButton>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('trae un anillo de foco de teclado y conserva el className del call site', () => {
    render(
      <IconButton label="X" className="absolute top-1 text-ink-300">
        i
      </IconButton>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toHaveClass('focus-visible:ring-2', 'absolute', 'top-1', 'text-ink-300')
  })

  it('reenvía props nativas (onClick, disabled, title)', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <IconButton label="X" onClick={onClick} title="tip">
        i
      </IconButton>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('title', 'tip')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <IconButton label="X" onClick={onClick} disabled>
        i
      </IconButton>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce() // disabled: no dispara de nuevo
  })
})
