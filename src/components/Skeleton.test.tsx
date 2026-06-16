import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Skeleton, EntityCardSkeleton } from './Skeleton'

describe('<Skeleton />', () => {
  it('uses the canonical premium skeleton line class', () => {
    const { container } = render(<Skeleton className="h-4 w-12" />)
    const node = container.querySelector('[aria-hidden="true"]')

    expect(node).toHaveClass('skeleton-line')
    expect(node).toHaveClass('skeleton-shimmer')
  })

  it('uses the premium skeleton surface for card placeholders', () => {
    const { container } = render(<EntityCardSkeleton />)
    expect(container.querySelector('.skeleton-surface')).toBeInTheDocument()
  })
})
