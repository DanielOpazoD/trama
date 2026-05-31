import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsMobile } from './useIsMobile'

describe('useIsMobile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lee matchMedia y reacciona a cambios modernos', () => {
    let listener: ((event: MediaQueryListEvent) => void) | null = null
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(max-width: 767px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event, cb) => {
        listener = cb as (event: MediaQueryListEvent) => void
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)

    act(() => {
      listener?.({ matches: true } as MediaQueryListEvent)
    })

    expect(result.current).toBe(true)
  })

  it('usa addListener en navegadores legacy', () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(max-width: 599px)',
      onchange: null,
      addListener,
      removeListener,
      addEventListener: undefined as unknown as MediaQueryList['addEventListener'],
      removeEventListener: undefined as unknown as MediaQueryList['removeEventListener'],
      dispatchEvent: vi.fn(),
    })

    const { result, unmount } = renderHook(() => useIsMobile(600))

    expect(result.current).toBe(true)
    expect(addListener).toHaveBeenCalledOnce()

    unmount()

    expect(removeListener).toHaveBeenCalledOnce()
  })
})
