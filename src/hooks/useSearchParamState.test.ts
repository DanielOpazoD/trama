import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useSearchParamState } from './useSearchParamState'

const ORIGIN = `${window.location.origin}/`

describe('useSearchParamState', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', ORIGIN)
  })
  afterEach(() => {
    window.history.replaceState(null, '', ORIGIN)
  })

  it('arranca con null si el param no está en la URL', () => {
    const { result } = renderHook(() => useSearchParamState('entity'))
    expect(result.current[0]).toBeNull()
  })

  it('lee valor inicial desde la URL', () => {
    window.history.replaceState(null, '', `${ORIGIN}?entity=abc`)
    const { result } = renderHook(() => useSearchParamState('entity'))
    expect(result.current[0]).toBe('abc')
  })

  it('setValue actualiza state y URL', () => {
    const { result } = renderHook(() => useSearchParamState('entity'))
    act(() => result.current[1]('xyz'))
    expect(result.current[0]).toBe('xyz')
    expect(window.location.search).toContain('entity=xyz')
  })

  it('setValue(null) limpia el param de la URL', () => {
    window.history.replaceState(null, '', `${ORIGIN}?entity=abc`)
    const { result } = renderHook(() => useSearchParamState('entity'))
    act(() => result.current[1](null))
    expect(result.current[0]).toBeNull()
    expect(window.location.search).not.toContain('entity=')
  })

  it('cambios subsecuentes no llenan el history (replaceState default)', () => {
    const { result } = renderHook(() => useSearchParamState('entity'))
    const lengthBefore = window.history.length
    act(() => result.current[1]('a'))
    act(() => result.current[1]('b'))
    act(() => result.current[1]('c'))
    // replaceState no incrementa history.length
    expect(window.history.length).toBe(lengthBefore)
  })

  it('opción push: usa pushState (incrementa history)', () => {
    const { result } = renderHook(() => useSearchParamState('entity', { push: true }))
    const before = window.history.length
    act(() => result.current[1]('a'))
    expect(window.history.length).toBeGreaterThan(before)
  })

  it('popstate sincroniza el state con la URL (back/forward)', () => {
    const { result } = renderHook(() => useSearchParamState('entity'))
    act(() => result.current[1]('first'))
    expect(result.current[0]).toBe('first')
    // Simular que el browser cambió la URL (e.g., usuario clickea back)
    act(() => {
      window.history.replaceState(null, '', `${ORIGIN}?entity=second`)
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current[0]).toBe('second')
  })

  it('distingue keys independientes', () => {
    const { result: a } = renderHook(() => useSearchParamState('a'))
    const { result: b } = renderHook(() => useSearchParamState('b'))
    act(() => a.current[1]('1'))
    act(() => b.current[1]('2'))
    expect(window.location.search).toMatch(/a=1/)
    expect(window.location.search).toMatch(/b=2/)
  })
})
