import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { FeedSkeleton } from './FeedSkeleton'

describe('<FeedSkeleton />', () => {
  it('renderiza el número de tarjetas-esqueleto pedido', () => {
    const { container } = render(<FeedSkeleton count={4} />)
    // Cada placeholder es una card-paper-soft.
    expect(container.querySelectorAll('.card-paper-soft')).toHaveLength(4)
  })

  it('usa shimmer (animate-shimmer) en las líneas de placeholder', () => {
    const { container } = render(<FeedSkeleton count={1} />)
    expect(container.querySelectorAll('.animate-shimmer').length).toBeGreaterThan(0)
  })

  it('por defecto renderiza 3 placeholders', () => {
    const { container } = render(<FeedSkeleton />)
    expect(container.querySelectorAll('.card-paper-soft')).toHaveLength(3)
  })
})
