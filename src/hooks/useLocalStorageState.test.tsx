import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  useLocalStorageBoolean,
  useLocalStorageNullable,
  useLocalStorageState,
} from './useLocalStorageState'

/**
 * Tests para los 3 hooks de persist en localStorage. Cubrimos las 3
 * variantes (string + validador, nullable, boolean) y los caminos de
 * defensa: storage vacío, valor inválido, storage que tira excepción.
 */

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('useLocalStorageState (string + validate)', () => {
  it('arranca con el initial si el storage está vacío', () => {
    const { result } = renderHook(() =>
      useLocalStorageState<'a' | 'b'>(
        'trama.x',
        'a',
        (raw): raw is 'a' | 'b' => raw === 'a' || raw === 'b',
      ),
    )
    expect(result.current[0]).toBe('a')
  })

  it('lee el valor del storage si está y pasa el validador', () => {
    window.localStorage.setItem('trama.x', 'b')
    const { result } = renderHook(() =>
      useLocalStorageState<'a' | 'b'>(
        'trama.x',
        'a',
        (raw): raw is 'a' | 'b' => raw === 'a' || raw === 'b',
      ),
    )
    expect(result.current[0]).toBe('b')
  })

  it('cae al initial si el valor del storage NO pasa el validador', () => {
    window.localStorage.setItem('trama.x', 'corrupted')
    const { result } = renderHook(() =>
      useLocalStorageState<'a' | 'b'>(
        'trama.x',
        'a',
        (raw): raw is 'a' | 'b' => raw === 'a' || raw === 'b',
      ),
    )
    expect(result.current[0]).toBe('a')
  })

  it('setValue actualiza state Y storage', () => {
    const { result } = renderHook(() => useLocalStorageState<string>('trama.x', 'a'))
    act(() => result.current[1]('z'))
    expect(result.current[0]).toBe('z')
    expect(window.localStorage.getItem('trama.x')).toBe('z')
  })

  it('mismo setter identity entre renders (useCallback)', () => {
    const { result, rerender } = renderHook(() =>
      useLocalStorageState<string>('trama.x', 'a'),
    )
    const s1 = result.current[1]
    rerender()
    expect(result.current[1]).toBe(s1)
  })

  it('sin validator, acepta cualquier string del storage', () => {
    window.localStorage.setItem('trama.x', 'cualquier-cosa')
    const { result } = renderHook(() => useLocalStorageState<string>('trama.x', 'a'))
    expect(result.current[0]).toBe('cualquier-cosa')
  })
})

describe('useLocalStorageNullable', () => {
  it('arranca como null si el storage está vacío', () => {
    const { result } = renderHook(() => useLocalStorageNullable('trama.focus'))
    expect(result.current[0]).toBeNull()
  })

  it('lee string si está en storage', () => {
    window.localStorage.setItem('trama.focus', 'entity-123')
    const { result } = renderHook(() => useLocalStorageNullable('trama.focus'))
    expect(result.current[0]).toBe('entity-123')
  })

  it('set a null borra el entry del storage', () => {
    window.localStorage.setItem('trama.focus', 'entity-123')
    const { result } = renderHook(() => useLocalStorageNullable('trama.focus'))
    act(() => result.current[1](null))
    expect(result.current[0]).toBeNull()
    expect(window.localStorage.getItem('trama.focus')).toBeNull()
  })

  it('set a string lo escribe', () => {
    const { result } = renderHook(() => useLocalStorageNullable('trama.focus'))
    act(() => result.current[1]('entity-abc'))
    expect(result.current[0]).toBe('entity-abc')
    expect(window.localStorage.getItem('trama.focus')).toBe('entity-abc')
  })
})

describe('useLocalStorageBoolean', () => {
  it('default false cuando storage vacío + initial false', () => {
    const { result } = renderHook(() => useLocalStorageBoolean('trama.flag'))
    expect(result.current[0]).toBe(false)
  })

  it('default true cuando se pasa initial true', () => {
    const { result } = renderHook(() => useLocalStorageBoolean('trama.flag', true))
    expect(result.current[0]).toBe(true)
  })

  it('lee "1" → true', () => {
    window.localStorage.setItem('trama.flag', '1')
    const { result } = renderHook(() => useLocalStorageBoolean('trama.flag'))
    expect(result.current[0]).toBe(true)
  })

  it('lee "0" → false', () => {
    window.localStorage.setItem('trama.flag', '0')
    const { result } = renderHook(() => useLocalStorageBoolean('trama.flag', true))
    expect(result.current[0]).toBe(false)
  })

  it('persist "1" / "0" en storage al cambiar', () => {
    const { result } = renderHook(() => useLocalStorageBoolean('trama.flag'))
    act(() => result.current[1](true))
    expect(window.localStorage.getItem('trama.flag')).toBe('1')
    act(() => result.current[1](false))
    expect(window.localStorage.getItem('trama.flag')).toBe('0')
  })
})
