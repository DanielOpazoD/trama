import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyMessage } from './EmptyMessage'

describe('<EmptyMessage />', () => {
  it('renders the heading and body', () => {
    render(<EmptyMessage title="Nada por aquí" body="prueba con más contexto." />)
    expect(screen.getByText('Nada por aquí')).toBeInTheDocument()
    expect(screen.getByText(/prueba con más contexto/i)).toBeInTheDocument()
  })

  it('renders the hint when provided', () => {
    render(<EmptyMessage title="Vacío" hint="hint visible" />)
    expect(screen.getByText('hint visible')).toBeInTheDocument()
  })

  it('omits the hint when not provided', () => {
    render(<EmptyMessage title="Vacío" />)
    expect(screen.queryByText(/^hint/i)).not.toBeInTheDocument()
  })

  it('renders an action when provided', () => {
    render(<EmptyMessage title="Vacío" action={<button type="button">empezar</button>} />)
    expect(screen.getByRole('button', { name: /empezar/i })).toBeInTheDocument()
  })

  it('uses the soft variant by default', () => {
    const { container } = render(<EmptyMessage title="x" />)
    expect(container.querySelector('.border-dashed')).not.toBeNull()
  })

  it("strips the soft card with variant='plain'", () => {
    const { container } = render(<EmptyMessage title="x" variant="plain" />)
    expect(container.querySelector('.border-dashed')).toBeNull()
  })
})
