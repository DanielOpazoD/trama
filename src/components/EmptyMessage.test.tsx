import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyAction, EmptyMessage } from './EmptyMessage'

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
    const empty = container.querySelector('.empty-message')

    expect(empty).toHaveClass('empty-message--soft')
    expect(screen.getByTestId('empty-message-thread-motif')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it("strips the soft card with variant='plain'", () => {
    const { container } = render(<EmptyMessage title="x" variant="plain" />)
    const empty = container.querySelector('.empty-message')

    expect(empty).toHaveClass('empty-message--plain')
    expect(empty).not.toHaveClass('empty-message--soft')
  })
})

describe('<EmptyAction />', () => {
  it('es un botón de tinta con alto táctil que no envía formularios', () => {
    render(<EmptyAction onClick={() => {}}>Empezar</EmptyAction>)
    const boton = screen.getByRole('button', { name: 'Empezar' })
    expect(boton).toHaveAttribute('type', 'button')
    expect(boton).toHaveClass('btn-ink', 'min-h-[44px]', 'text-caption')
  })

  it('mientras carga queda deshabilitado y lo anuncia', () => {
    render(
      <EmptyAction loading onClick={() => {}}>
        Subir
      </EmptyAction>,
    )
    const boton = screen.getByRole('button', { name: 'Subir' })
    expect(boton).toBeDisabled()
    expect(boton).toHaveAttribute('aria-busy', 'true')
  })

  it('suma clases locales sin perder las suyas', () => {
    render(<EmptyAction className="max-w-full truncate">Retomar</EmptyAction>)
    expect(screen.getByRole('button', { name: 'Retomar' })).toHaveClass(
      'btn-ink',
      'text-caption',
      'truncate',
    )
  })
})
