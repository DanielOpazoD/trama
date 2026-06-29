import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('<Button />', () => {
  it('renderiza children con texto como nombre accesible', () => {
    render(<Button>Guardar</Button>)
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument()
  })

  it('es type="button" por defecto (no envía formularios sin querer)', () => {
    render(<Button>X</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('permite override de type', () => {
    render(<Button type="submit">Enviar</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('mapea cada variant a su clase existente; accent por defecto', () => {
    const { rerender } = render(<Button>x</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-accent')
    rerender(<Button variant="ink">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-ink')
    rerender(<Button variant="quiet">x</Button>)
    expect(screen.getByRole('button')).toHaveClass('section-eyebrow')
  })

  it('concatena el className del call site después de la variante', () => {
    render(<Button className="text-xs w-full">x</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveClass('btn-accent', 'text-xs', 'w-full')
    // No impone su propio focus-visible: usa el :focus-visible global.
    expect(btn.className).not.toMatch(/focus-visible|ring-/)
  })

  it('loading deshabilita, marca aria-busy y muestra loadingLabel si se pasa', () => {
    const onClick = vi.fn()
    render(
      <Button loading loadingLabel="guardando…" onClick={onClick}>
        guardar cambios
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(btn).toHaveTextContent('guardando…')
    expect(btn).not.toHaveTextContent('guardar cambios')
    fireEvent.click(btn)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('loading sin loadingLabel conserva children pero sigue deshabilitado', () => {
    render(<Button loading>guardar</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveTextContent('guardar')
  })

  it('reenvía props nativas (onClick, disabled, title)', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <Button onClick={onClick} title="tip">
        x
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('title', 'tip')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledOnce()
    rerender(
      <Button onClick={onClick} disabled>
        x
      </Button>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce() // disabled: no dispara de nuevo
  })
})
