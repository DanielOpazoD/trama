import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Spinner } from './Spinner'

describe('<Spinner />', () => {
  it('renders the branded data loading variant by default', () => {
    render(<Spinner />)
    const spinner = screen.getByRole('status', { name: 'cargando' })
    expect(spinner).toHaveClass('trama-spinner')
    expect(spinner).toHaveClass('trama-spinner--data')
  })

  it('supports the AI thinking variant with an explicit label', () => {
    render(<Spinner variant="ai" label="pensando" tone="inverse" size={18} />)
    const spinner = screen.getByRole('status', { name: 'pensando' })
    expect(spinner).toHaveClass('trama-spinner--ai')
    expect(spinner).toHaveClass('trama-spinner--inverse')
    expect(spinner).toHaveStyle({ '--trama-spinner-size': '18px' })
  })

  it('can be rendered as a decorative glyph inside existing status text', () => {
    render(<Spinner decorative />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('trama-spinner')).toHaveAttribute('aria-hidden', 'true')
  })

  it('supports an idle state for offscreen placeholders', () => {
    render(<Spinner active={false} />)
    expect(screen.getByTestId('trama-spinner')).toHaveClass('trama-spinner--idle')
  })
})
