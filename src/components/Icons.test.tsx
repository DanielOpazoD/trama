import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TramaMark } from './Icons'

describe('<TramaMark />', () => {
  it('usa el isotipo PNG nuevo incluso en la variante animada', () => {
    const { container } = render(<TramaMark size={72} animate />)

    const mark = container.querySelector('img')
    expect(mark).toHaveAttribute('src', '/favicon-48.png')
  })
})
