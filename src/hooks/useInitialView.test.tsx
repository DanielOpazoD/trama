import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInitialView } from './useInitialView'

// Mock startViewTransition para que se comporte sincrónico (la API
// real existe en Chrome solamente; en happy-dom no). El hook ya tiene
// fallback al setState plano cuando la API no está, así que lo
// reemplazamos por un noop que invoca el callback inmediatamente.
vi.mock('../lib/viewTransition', () => ({
  startViewTransition: (fn: () => void) => fn(),
}))

describe('useInitialView', () => {
  const originalLocation = window.location

  beforeEach(() => {
    // happy-dom permite reasignar window.location; algunas envs no, así
    // que usamos Object.defineProperty para máxima compatibilidad.
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, search: '' },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    })
  })

  it('default a "inicio" cuando no hay ?view= en la URL', () => {
    window.location.search = ''
    const { result } = renderHook(() => useInitialView())
    expect(result.current[0]).toBe('inicio')
  })

  it('lee ?view=momentos del query string', () => {
    window.location.search = '?view=momentos'
    const { result } = renderHook(() => useInitialView())
    expect(result.current[0]).toBe('momentos')
  })

  it('lee ?view=chat junto con otros params', () => {
    window.location.search = '?view=chat&entity=abc-123'
    const { result } = renderHook(() => useInitialView())
    expect(result.current[0]).toBe('chat')
  })

  it('ignora un view inválido y cae a "inicio"', () => {
    window.location.search = '?view=hackerville'
    const { result } = renderHook(() => useInitialView())
    expect(result.current[0]).toBe('inicio')
  })

  it('acepta cada uno de los 8 valores válidos', () => {
    const valid = [
      'inicio', 'grafo', 'entidades', 'citas', 'escuchas', 'momentos', 'chat', 'sugerencias',
    ]
    for (const v of valid) {
      window.location.search = `?view=${v}`
      const { result } = renderHook(() => useInitialView())
      expect(result.current[0]).toBe(v)
    }
  })

  it('setView cambia el state', () => {
    window.location.search = '?view=inicio'
    const { result } = renderHook(() => useInitialView())
    expect(result.current[0]).toBe('inicio')
    act(() => result.current[1]('grafo'))
    expect(result.current[0]).toBe('grafo')
  })

  it('setView mantiene identidad estable entre renders (useCallback)', () => {
    const { result, rerender } = renderHook(() => useInitialView())
    const setView1 = result.current[1]
    rerender()
    const setView2 = result.current[1]
    expect(setView1).toBe(setView2)
  })
})
