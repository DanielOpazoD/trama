import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TramaMark } from './Icons'

describe('<TramaMark />', () => {
  it('usa el isotipo PNG nuevo incluso en la variante animada', () => {
    const { container } = render(<TramaMark size={72} animate />)

    const mark = container.querySelector('img')
    expect(mark).toHaveAttribute('src', '/favicon-48.png')
  })

  it('ofrece fuentes de mayor resolucion para tamaños grandes y pantallas retina', () => {
    const { container } = render(<TramaMark size={72} />)

    const mark = container.querySelector('img')
    expect(mark).toHaveAttribute(
      'srcSet',
      '/favicon-48.png 48w, /icon-192.png 192w, /trama-icon.png 1024w',
    )
    expect(mark).toHaveAttribute(
      'sizes',
      '(max-width: 48px) 48px, (max-width: 192px) 192px, 1024px',
    )
  })
})
