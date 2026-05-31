import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePullToRefresh } from './usePullToRefresh'

function touchEvent(type: string, clientY?: number) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', {
    value: clientY === undefined ? [] : [{ clientY }],
  })
  return event
}

describe('usePullToRefresh', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
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
    vi.restoreAllMocks()
  })

  it('dispara refresh al superar el umbral desde el tope', async () => {
    const el = document.createElement('div')
    const ref = { current: el }
    const onRefresh = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => usePullToRefresh(ref, onRefresh))

    act(() => {
      el.dispatchEvent(touchEvent('touchstart', 10))
      el.dispatchEvent(touchEvent('touchmove', 100))
    })

    expect(result.current.pullDistance).toBeGreaterThan(1)

    act(() => {
      el.dispatchEvent(touchEvent('touchend'))
    })

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledOnce()
      expect(result.current.refreshing).toBe(false)
      expect(result.current.pullDistance).toBe(0)
    })
  })

  it('ignora desktop y pulls bajo el umbral', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })
    const el = document.createElement('div')
    const ref = { current: el }
    const onRefresh = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() => usePullToRefresh(ref, onRefresh))

    act(() => {
      el.dispatchEvent(touchEvent('touchstart', 10))
      el.dispatchEvent(touchEvent('touchmove', 30))
      el.dispatchEvent(touchEvent('touchend'))
    })

    expect(onRefresh).not.toHaveBeenCalled()
    expect(result.current.pullDistance).toBe(0)
  })
})
