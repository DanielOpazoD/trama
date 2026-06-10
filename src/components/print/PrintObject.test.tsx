import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrintObject } from './PrintObject'

describe('<PrintObject />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('print', vi.fn())
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('marca el html, portalea la hoja y dispara window.print', () => {
    const onDone = vi.fn()
    const { unmount } = render(
      <PrintObject onDone={onDone}>
        <p>pliego</p>
      </PrintObject>,
    )
    expect(document.documentElement.classList.contains('print-object-active')).toBe(true)
    // La hoja vive FUERA de #root (portal directo a body).
    expect(document.body.querySelector('.print-object')?.textContent).toBe('pliego')
    act(() => {
      vi.advanceTimersByTime(120)
    })
    expect(window.print).toHaveBeenCalledTimes(1)

    // afterprint → onDone (el caller desmonta).
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(onDone).toHaveBeenCalledTimes(1)

    unmount()
    expect(document.documentElement.classList.contains('print-object-active')).toBe(false)
  })
})
