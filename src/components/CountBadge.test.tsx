import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CountBadge } from './CountBadge'

describe('<CountBadge />', () => {
  it('no renderiza nada cuando el conteo es 0 o negativo', () => {
    const { container, rerender } = render(<CountBadge count={0} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<CountBadge count={-3} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el conteo', () => {
    render(<CountBadge count={5} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('capa el conteo en max y muestra "max+"', () => {
    const { rerender } = render(<CountBadge count={150} />)
    expect(screen.getByText('99+')).toBeInTheDocument()
    rerender(<CountBadge count={12} max={9} />)
    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('es decorativo (aria-hidden, sin role): el conteo lo anuncia el control padre', () => {
    render(<CountBadge count={3} />)
    const badge = screen.getByText('3')
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(badge).not.toHaveAttribute('role')
  })

  it('propaga className y style al call site (cero drift visual)', () => {
    render(
      <CountBadge
        count={1}
        className="absolute -top-1 -right-1"
        style={{ backgroundColor: 'rgb(1, 2, 3)' }}
      />,
    )
    const badge = screen.getByText('1')
    expect(badge).toHaveClass('absolute', '-top-1', '-right-1')
    expect(badge).toHaveStyle({ backgroundColor: 'rgb(1, 2, 3)' })
  })
})
