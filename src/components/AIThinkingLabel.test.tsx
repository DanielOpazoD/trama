import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AIThinkingLabel } from './AIThinkingLabel'

describe('<AIThinkingLabel />', () => {
  it('renders a decorative AI spinner with the canonical thinking copy', () => {
    render(<AIThinkingLabel />)
    expect(screen.getByText('pensando…')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('trama-spinner')).toHaveClass('trama-spinner--ai')
  })

  it('supports custom copy and inverse tone for ink buttons', () => {
    render(<AIThinkingLabel text="revisando" tone="inverse" />)
    expect(screen.getByText('revisando…')).toBeInTheDocument()
    expect(screen.getByTestId('trama-spinner')).toHaveClass('trama-spinner--inverse')
  })
})
