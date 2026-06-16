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

  it('maps semantic AI states to Trama copy', () => {
    const { container } = render(<AIThinkingLabel state="synthesizing" />)
    expect(screen.getByText('sintetizando…')).toBeInTheDocument()
    expect(container.querySelector('.ai-thinking-label')).toHaveAttribute(
      'data-ai-state',
      'synthesizing',
    )
  })

  it('lets explicit copy override the semantic state', () => {
    render(<AIThinkingLabel state="proposing" text="afinando" />)
    expect(screen.getByText('afinando…')).toBeInTheDocument()
  })
})
