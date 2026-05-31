import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomeSkeleton } from './HomeSkeleton'

describe('<HomeSkeleton />', () => {
  it('renderiza la silueta de inicio sin texto visible de carga genérico', () => {
    const { container } = render(<HomeSkeleton />)

    expect(container.querySelector('#main-scroll')).toBeInTheDocument()
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(16)
    expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument()
  })
})
