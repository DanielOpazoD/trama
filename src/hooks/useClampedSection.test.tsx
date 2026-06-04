import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClampedSection } from './useClampedSection'

type S = 'home' | 'a' | 'b'

describe('useClampedSection', () => {
  it('mantiene la sección visible; la clampa al fallback si deja de serlo', () => {
    let hidden = new Set<S>()
    const iv = (s: S) => (s === 'home' ? true : !hidden.has(s))
    const { result, rerender } = renderHook(
      ({ f }: { f: (s: S) => boolean }) => useClampedSection<S>('a', 'home', f),
      { initialProps: { f: iv } },
    )
    expect(result.current[0]).toBe('a') // visible → se queda

    // Ocultar 'a' → en el próximo render se clampa a 'home'.
    hidden = new Set<S>(['a'])
    rerender({ f: (s: S) => (s === 'home' ? true : !hidden.has(s)) })
    expect(result.current[0]).toBe('home')
  })

  it('el setter cambia la sección', () => {
    const { result } = renderHook(() => useClampedSection<S>('home', 'home', () => true))
    act(() => result.current[1]('a'))
    expect(result.current[0]).toBe('a')
  })
})
