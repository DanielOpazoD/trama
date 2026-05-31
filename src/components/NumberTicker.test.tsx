import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NumberTicker } from './NumberTicker'

describe('<NumberTicker />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      return window.setTimeout(() => cb(performance.now()), 16)
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      window.clearTimeout(id)
    })
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('anima hacia el nuevo valor', () => {
    const { rerender } = render(<NumberTicker value={10} />)
    expect(screen.getByText('10')).toBeInTheDocument()

    rerender(<NumberTicker value={20} />)
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.getByText('20')).toBeInTheDocument()
  })

  it('salta directo al valor final con reduced motion', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
    const { rerender } = render(<NumberTicker value={3} />)

    rerender(<NumberTicker value={7} />)

    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('no oculta dependencias de hooks con suppressions de exhaustive-deps', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/NumberTicker.tsx'),
      'utf8',
    )
    expect(source).not.toContain('eslint-disable-next-line react-hooks/exhaustive-deps')
  })
})
