import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimeOfDayAccent } from './useTimeOfDayAccent'

describe('useTimeOfDayAccent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.documentElement.style.removeProperty('--accent-gold')
    document.documentElement.style.removeProperty('--accent-gold-soft')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('aplica el acento según la hora y reevalúa periódicamente', () => {
    vi.setSystemTime(new Date('2026-05-31T08:00:00'))
    renderHook(() => useTimeOfDayAccent())

    expect(document.documentElement.style.getPropertyValue('--accent-gold')).toBe(
      '#a86f3c',
    )

    vi.setSystemTime(new Date('2026-05-31T22:00:00'))
    vi.advanceTimersByTime(30 * 60 * 1000)

    expect(document.documentElement.style.getPropertyValue('--accent-gold')).toBe(
      '#7a6b94',
    )
  })
})
