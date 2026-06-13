import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraphHoverPreview } from './useGraphHoverPreview'

describe('useGraphHoverPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the hovered entity only after the configured delay', () => {
    const { result } = renderHook(() => useGraphHoverPreview({ delayMs: 600 }))

    act(() => result.current.scheduleHover('ent-1'))

    expect(result.current.hoveredEntityId).toBe(null)

    act(() => vi.advanceTimersByTime(599))
    expect(result.current.hoveredEntityId).toBe(null)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current.hoveredEntityId).toBe('ent-1')
  })

  it('cancels pending hover previews and clears the visible preview', () => {
    const { result } = renderHook(() => useGraphHoverPreview({ delayMs: 600 }))

    act(() => result.current.scheduleHover('ent-1'))
    act(() => result.current.cancelHover())
    act(() => vi.advanceTimersByTime(600))

    expect(result.current.hoveredEntityId).toBe(null)

    act(() => result.current.scheduleHover('ent-2'))
    act(() => vi.advanceTimersByTime(600))
    expect(result.current.hoveredEntityId).toBe('ent-2')

    act(() => result.current.cancelHover())
    expect(result.current.hoveredEntityId).toBe(null)
  })
})
