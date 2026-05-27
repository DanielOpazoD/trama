import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FirstMomentPreview } from './FirstMomentPreview'

describe('<FirstMomentPreview />', () => {
  it('renders the editorial preview with sample Borges quote', () => {
    render(<FirstMomentPreview />)
    // El drop-cap separa la 'E' inicial en otro <span>, así que el
    // matcher por texto contiguo no encuentra la frase. Verificamos
    // que el bloque entero contiene la frase usando textContent del
    // blockquote.
    const blockquote = document.querySelector('blockquote')!
    expect(blockquote.textContent).toMatch(
      /El tiempo es la sustancia de que estoy hecho/,
    )
    expect(screen.getByText(/Jorge Luis Borges/)).toBeInTheDocument()
  })

  it('marks the preview as "ejemplo" + has accent eyebrow', () => {
    render(<FirstMomentPreview />)
    expect(screen.getByText('ejemplo')).toBeInTheDocument()
    expect(
      screen.getByText(/así se verá tu primera cita/i),
    ).toBeInTheDocument()
  })

  it('has an aria-label so screen readers understand its role', () => {
    const { container } = render(<FirstMomentPreview />)
    const section = container.querySelector('section')!
    expect(section.getAttribute('aria-label')).toMatch(/ejemplo/i)
  })

  it('shows the "empieza pegando algo abajo ↓" hint on desktop', () => {
    render(<FirstMomentPreview />)
    expect(
      screen.getByText(/empieza pegando algo abajo/i),
    ).toBeInTheDocument()
  })
})
