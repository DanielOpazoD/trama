import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewHeader } from './ViewHeader'

describe('<ViewHeader />', () => {
  it('renders title (h2 serif), eyebrow and accent rule', () => {
    const { container } = render(
      <ViewHeader title="Citas" eyebrow="fragmentos que retuviste" />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Citas' })).toBeInTheDocument()
    expect(screen.getByText('fragmentos que retuviste')).toBeInTheDocument()
    // accent-rule sits visible as the small line below the title
    expect(container.querySelector('.accent-rule')).not.toBeNull()
  })

  it('renders subtitle when provided', () => {
    render(
      <ViewHeader
        title="Citas"
        eyebrow="x"
        subtitle="Fragmentos textuales atribuidos."
      />,
    )
    expect(screen.getByText(/Fragmentos textuales atribuidos/)).toBeInTheDocument()
  })

  it('omits subtitle when not provided', () => {
    render(<ViewHeader title="Citas" eyebrow="x" />)
    // ningún <p> dentro del header además del eyebrow → eyebrow es <p> también,
    // así que verificamos que NO hay texto distinto al eyebrow
    expect(screen.queryByText(/Fragmentos/)).not.toBeInTheDocument()
  })

  it('renders an action slot when provided', () => {
    render(<ViewHeader title="Citas" eyebrow="x" action={<button>Añadir</button>} />)
    expect(screen.getByRole('button', { name: 'Añadir' })).toBeInTheDocument()
  })

  it('applies sticky classes when sticky=true', () => {
    const { container } = render(<ViewHeader title="x" eyebrow="x" sticky />)
    const header = container.querySelector('header')!
    expect(header.className).toContain('sticky')
    expect(header.className).toContain('backdrop-blur')
  })

  it('omits wash layout when sticky (no negative margins)', () => {
    // happy-dom no soporta `color-mix()` así que descarta el style inline
    // del wash y no podemos asertear por backgroundImage. En su lugar
    // verificamos las clases de layout: el modo wash usa `-mx-3 -my-2
    // rounded-lg`; el modo sticky omite eso (solo flex + gap).
    const { container } = render(<ViewHeader title="x" eyebrow="x" sticky />)
    const cls = container.querySelector('header')!.className
    expect(cls).not.toContain('-mx-3')
    expect(cls).not.toContain('rounded-lg')
  })

  it('applies wash layout (negative margins + rounded) when not sticky', () => {
    const { container } = render(<ViewHeader title="x" eyebrow="x" />)
    const cls = container.querySelector('header')!.className
    expect(cls).toContain('-mx-3')
    expect(cls).toContain('rounded-lg')
  })

  it('skips wash layout when noWash=true', () => {
    const { container } = render(<ViewHeader title="x" eyebrow="x" noWash />)
    const cls = container.querySelector('header')!.className
    expect(cls).not.toContain('-mx-3')
    expect(cls).not.toContain('rounded-lg')
  })

  it('uses different bottom-margin per spacing prop', () => {
    const tight = render(<ViewHeader title="x" eyebrow="x" spacing="tight" />)
    expect(tight.container.querySelector('header')!.className).toContain('mb-6')

    const wide = render(<ViewHeader title="x" eyebrow="x" spacing="wide" />)
    expect(wide.container.querySelector('header')!.className).toContain('mb-10')
  })
})
