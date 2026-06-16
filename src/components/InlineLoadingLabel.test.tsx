import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InlineLoadingLabel } from './InlineLoadingLabel'

describe('<InlineLoadingLabel />', () => {
  it('renders canonical lowercase loading copy with a decorative data spinner', () => {
    render(<InlineLoadingLabel text="Cargando MÁS" />)

    expect(screen.getByText('cargando más…')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('trama-spinner')).toHaveClass('trama-spinner--data')
  })

  it('can expose a polite status for standalone loading regions', () => {
    render(<InlineLoadingLabel text="generando vista previa" status />)

    const status = screen.getByRole('status', { name: 'generando vista previa' })
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  it('supports inverse tone for solid buttons', () => {
    render(<InlineLoadingLabel text="leyendo" tone="inverse" />)
    expect(screen.getByTestId('trama-spinner')).toHaveClass('trama-spinner--inverse')
  })
})
