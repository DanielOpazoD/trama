import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WaitingVoice } from './WaitingVoice'

describe('<WaitingVoice />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('muestra la primera frase y rota a la siguiente tras el intervalo', () => {
    render(
      <WaitingVoice
        phrases={['cosiendo el pliego…', 'prensando la tinta…']}
        intervalMs={1000}
      />,
    )
    expect(screen.getByText('cosiendo el pliego…')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000 + 250)
    })
    expect(screen.getByText('prensando la tinta…')).toBeInTheDocument()
  })

  it('con prefers-reduced-motion no rota: la primera frase, quieta', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    )
    render(<WaitingVoice phrases={['una…', 'otra…']} intervalMs={500} />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByText('una…')).toBeInTheDocument()
    expect(screen.queryByText('otra…')).toBeNull()
  })

  it('con una sola frase no programa timers', () => {
    render(<WaitingVoice phrases={['solo esta…']} />)
    expect(vi.getTimerCount()).toBe(0)
    expect(screen.getByText('solo esta…')).toBeInTheDocument()
  })
})
