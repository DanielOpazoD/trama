import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TramaMark } from './Icons'

describe('<TramaMark />', () => {
  it('usa el isotipo PNG nuevo incluso en la variante animada', () => {
    const { container } = render(<TramaMark size={72} animate />)

    const mark = container.querySelector('img')
    expect(mark).toHaveAttribute('src', '/favicon-48.png')
  })

  it('mantiene la marca de la shell en assets pequeños', () => {
    const { container } = render(<TramaMark size={72} />)

    const mark = container.querySelector('img')
    expect(mark).toHaveAttribute('srcSet', '/favicon-48.png 48w, /icon-192.png 192w')
    expect(mark).toHaveAttribute('sizes', '72px')
    expect(mark?.getAttribute('srcSet')).not.toContain('/trama-icon.png')
  })
})
