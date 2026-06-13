import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useAppModals } from './useAppModals'

describe('useAppModals', () => {
  it('opens, closes and toggles named shell modals independently', () => {
    const { result } = renderHook(() => useAppModals())

    expect(result.current.settings).toBe(false)
    expect(result.current.palette).toBe(false)

    act(() => result.current.openModal('settings'))
    expect(result.current.settings).toBe(true)
    expect(result.current.palette).toBe(false)

    act(() => result.current.toggleModal('palette'))
    expect(result.current.settings).toBe(true)
    expect(result.current.palette).toBe(true)

    act(() => result.current.closeModal('settings'))
    expect(result.current.settings).toBe(false)
    expect(result.current.palette).toBe(true)
  })
})
