import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SectionAccentBand } from './SectionAccentBand'
import { SECTION_ACCENT } from '../lib/sectionAccent'

describe('<SectionAccentBand />', () => {
  it('renders as a 2px decorative band (aria-hidden)', () => {
    const { container } = render(<SectionAccentBand view="citas" />)
    const band = container.firstElementChild as HTMLElement
    expect(band).not.toBeNull()
    expect(band.getAttribute('aria-hidden')).not.toBeNull()
    expect(band.className).toContain('h-[2px]')
    expect(band.className).toContain('w-full')
  })

  it('uses the SECTION_ACCENT color for the view', () => {
    const { container } = render(<SectionAccentBand view="entidades" />)
    const band = container.firstElementChild as HTMLElement
    const style = band.getAttribute('style') ?? ''
    expect(style).toContain(SECTION_ACCENT.entidades)
  })

  it('uses a different gradient stop for grafo vs inicio', () => {
    const { container: c1 } = render(<SectionAccentBand view="grafo" />)
    const { container: c2 } = render(<SectionAccentBand view="inicio" />)
    const s1 = (c1.firstElementChild as HTMLElement).getAttribute('style') ?? ''
    const s2 = (c2.firstElementChild as HTMLElement).getAttribute('style') ?? ''
    expect(s1).not.toBe(s2)
  })
})
