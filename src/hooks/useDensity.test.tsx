import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDensity } from './useDensity'

describe('useDensity', () => {
  beforeEach(() => window.localStorage.clear())

  it('sin preferencia: cómodo para listas cortas, compacto para largas', () => {
    expect(renderHook(() => useDensity(10)).result.current.compact).toBe(false)
    expect(renderHook(() => useDensity(31)).result.current.compact).toBe(true)
  })

  it('la preferencia explícita manda sobre el conteo', () => {
    window.localStorage.setItem('trama:density', 'comodo')
    expect(renderHook(() => useDensity(500)).result.current.compact).toBe(false)
    window.localStorage.setItem('trama:density', 'compacto')
    expect(renderHook(() => useDensity(1)).result.current.compact).toBe(true)
  })

  it('setCompact persiste la elección', () => {
    const { result } = renderHook(() => useDensity(5))
    act(() => result.current.setCompact(true))
    expect(result.current.compact).toBe(true)
    expect(window.localStorage.getItem('trama:density')).toBe('compacto')
    act(() => result.current.setCompact(false))
    expect(window.localStorage.getItem('trama:density')).toBe('comodo')
  })
})
