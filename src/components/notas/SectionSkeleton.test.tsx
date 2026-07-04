import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SectionSkeleton } from './SectionSkeleton'

describe('<SectionSkeleton />', () => {
  it('anuncia la carga a lectores y pinta siluetas de cards ocultas', () => {
    const { container, getByRole } = render(<SectionSkeleton />)
    expect(getByRole('status')).toHaveTextContent('Cargando…')
    const visuals = container.querySelector('[aria-hidden]') as HTMLElement
    expect(visuals.querySelectorAll('.animate-shimmer').length).toBeGreaterThan(4)
    expect(container.querySelectorAll('.card-paper-soft').length).toBe(3)
  })

  it('la variante grid pinta siluetas de portada en cuadrícula', () => {
    const { container } = render(<SectionSkeleton variant="grid" />)
    expect(container.querySelectorAll('.aspect-\\[3\\/4\\]').length).toBe(8)
    expect(container.querySelectorAll('.card-paper-soft').length).toBe(0)
  })
})
