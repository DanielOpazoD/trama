import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionSkeleton } from './SectionSkeleton'

describe('<SectionSkeleton />', () => {
  it('pinta el hero y siluetas de cards con shimmer, oculto a lectores', () => {
    const { container } = render(<SectionSkeleton />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('aria-hidden')
    expect(container.querySelectorAll('.animate-shimmer').length).toBeGreaterThan(4)
    expect(container.querySelectorAll('.card-paper-soft').length).toBe(3)
  })

  it('la variante grid pinta siluetas de portada en cuadrícula', () => {
    const { container } = render(<SectionSkeleton variant="grid" />)
    expect(container.querySelectorAll('.aspect-\\[3\\/4\\]').length).toBe(8)
    expect(container.querySelectorAll('.card-paper-soft').length).toBe(0)
  })
})
