import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  setCurrentClientUserId,
  setCurrentClientUser,
  getCurrentClientUserId,
  getCurrentClientUserProfile,
  useCurrentClientUserId,
  useCurrentClientUserProfile,
} from './clientIdentity'

/**
 * `clientIdentity` es un store externo singleton (estado a nivel de módulo)
 * consumido por useSyncExternalStore. Estos tests fijan dos invariantes que
 * son fáciles de romper sin querer:
 *   - el cleanup que devuelven los setters NO debe pisar un set más nuevo;
 *   - getSnapshot del perfil debe ser referencialmente estable entre lecturas
 *     (si devolviera un objeto nuevo cada vez, useSyncExternalStore entraría en
 *     bucle infinito de renders).
 *
 * Como el estado vive en el módulo, reseteamos a vacío antes y después de cada
 * caso para no filtrar estado entre tests.
 */
beforeEach(() => {
  setCurrentClientUserId(null)
})
afterEach(() => {
  setCurrentClientUserId(null)
})

describe('clientIdentity store', () => {
  it('setCurrentClientUserId fija el id y limpia label/email previos', () => {
    setCurrentClientUser({ userId: 'u1', label: 'Ana', email: 'a@x.com' })
    expect(getCurrentClientUserProfile()).toEqual({
      userId: 'u1',
      label: 'Ana',
      email: 'a@x.com',
    })

    setCurrentClientUserId('u2')
    expect(getCurrentClientUserId()).toBe('u2')
    expect(getCurrentClientUserProfile()).toEqual({
      userId: 'u2',
      label: null,
      email: null,
    })
  })

  it('setCurrentClientUser recorta label/email y los vuelve null si quedan vacíos', () => {
    setCurrentClientUser({ userId: 'u1', label: '  Ana  ', email: '  a@x.com ' })
    expect(getCurrentClientUserProfile()).toEqual({
      userId: 'u1',
      label: 'Ana',
      email: 'a@x.com',
    })

    setCurrentClientUser({ userId: 'u1', label: '   ', email: '' })
    expect(getCurrentClientUserProfile()).toEqual({
      userId: 'u1',
      label: null,
      email: null,
    })
  })

  it('el cleanup resetea solo si el id sigue vigente (no pisa un set más nuevo)', () => {
    const cleanupA = setCurrentClientUserId('A')
    setCurrentClientUserId('B') // un set más nuevo toma el control
    cleanupA() // cleanup obsoleto: NO debe borrar a B
    expect(getCurrentClientUserId()).toBe('B')
  })

  it('el cleanup vigente sí resetea a null', () => {
    const cleanup = setCurrentClientUserId('X')
    cleanup()
    expect(getCurrentClientUserId()).toBeNull()
    expect(getCurrentClientUserProfile()).toEqual({
      userId: null,
      label: null,
      email: null,
    })
  })

  it('setCurrentClientUser también respeta el guard de cleanup obsoleto', () => {
    const cleanupA = setCurrentClientUser({ userId: 'A', label: 'Ana' })
    setCurrentClientUser({ userId: 'B', label: 'Beto' })
    cleanupA()
    expect(getCurrentClientUserProfile()).toEqual({
      userId: 'B',
      label: 'Beto',
      email: null,
    })
  })

  it('el snapshot del perfil es estable entre lecturas y nuevo tras un cambio', () => {
    setCurrentClientUserId('u1')
    const p1 = getCurrentClientUserProfile()
    const p2 = getCurrentClientUserProfile()
    expect(p1).toBe(p2) // misma referencia: clave para useSyncExternalStore

    setCurrentClientUserId('u2')
    expect(getCurrentClientUserProfile()).not.toBe(p1)
  })
})

describe('hooks de clientIdentity', () => {
  it('useCurrentClientUserId refleja los cambios del store', () => {
    const { result } = renderHook(() => useCurrentClientUserId())
    expect(result.current).toBeNull()

    act(() => {
      setCurrentClientUserId('u9')
    })
    expect(result.current).toBe('u9')
  })

  it('useCurrentClientUserProfile refleja label/email del perfil', () => {
    const { result } = renderHook(() => useCurrentClientUserProfile())

    act(() => {
      setCurrentClientUser({ userId: 'u1', label: 'Ana', email: null })
    })
    expect(result.current).toEqual({ userId: 'u1', label: 'Ana', email: null })
  })
})
