import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useInViewport } from './useInViewport'

function Probe() {
  const [ref, inView] = useInViewport<HTMLDivElement>()
  return (
    <div ref={ref} data-testid="probe">
      {inView ? 'visible' : 'oculto'}
    </div>
  )
}

describe('useInViewport', () => {
  it('reporta visible cuando el elemento entra al viewport', async () => {
    // El mock global de IntersectionObserver (test-setup) reporta intersección al
    // observar → el one-shot pasa a true.
    render(<Probe />)
    expect(await screen.findByText('visible')).toBeInTheDocument()
  })
})
