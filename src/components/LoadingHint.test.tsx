import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoadingHint } from './LoadingHint'

describe('<LoadingHint />', () => {
  it('lowercases the text and appends a trailing ellipsis', () => {
    render(<LoadingHint text="Cargando MOMENTOS" />)
    expect(screen.getByText('cargando momentos…')).toBeInTheDocument()
  })

  it('uses role="status" + aria-live polite for screen readers', () => {
    render(<LoadingHint text="cargando" />)
    const node = screen.getByRole('status')
    expect(node).toHaveAttribute('aria-live', 'polite')
  })

  it('uses text-caption by default', () => {
    const { container } = render(<LoadingHint text="cargando" />)
    expect(container.querySelector('p')!.className).toContain('text-caption')
  })

  it('uses text-sm when size="sm"', () => {
    const { container } = render(<LoadingHint text="cargando" size="sm" />)
    const cls = container.querySelector('p')!.className
    expect(cls).toContain('text-sm')
    expect(cls).not.toContain('text-caption')
  })

  it('always italic + ink-400 (canonical loading hue)', () => {
    const { container } = render(<LoadingHint text="cargando" />)
    const cls = container.querySelector('p')!.className
    expect(cls).toContain('italic')
    expect(cls).toContain('text-ink-400')
  })
})
