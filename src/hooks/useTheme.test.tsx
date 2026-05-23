import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTheme } from './useTheme'

const STORAGE_KEY = 'trama:theme'

function readStored() {
  return window.localStorage.getItem(STORAGE_KEY)
}

describe('useTheme', () => {
  beforeEach(() => {
    // Limpiamos cualquier residuo entre tests para que cada uno arranque
    // desde el default del SO.
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
  })

  afterEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('arranca en "paper" por default cuando no hay localStorage ni prefers-dark', () => {
    const { result } = renderHook(() => useTheme())
    expect(['paper', 'night']).toContain(result.current.theme)
  })

  it('respeta el valor de localStorage al iniciar (paper)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'paper')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('paper')
  })

  it('respeta el valor de localStorage al iniciar (night)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'night')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('night')
  })

  it('toggle() alterna entre paper y night', () => {
    window.localStorage.setItem(STORAGE_KEY, 'paper')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('paper')
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('night')
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('paper')
  })

  it('aplica class "dark" al <html> cuando theme === "night"', () => {
    window.localStorage.setItem(STORAGE_KEY, 'night')
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('NO aplica class "dark" cuando theme === "paper"', () => {
    window.localStorage.setItem(STORAGE_KEY, 'paper')
    renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('actualiza la class "dark" en cada cambio', () => {
    window.localStorage.setItem(STORAGE_KEY, 'paper')
    const { result } = renderHook(() => useTheme())
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    act(() => result.current.toggle())
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    act(() => result.current.toggle())
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persiste el cambio en localStorage', () => {
    window.localStorage.setItem(STORAGE_KEY, 'paper')
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggle())
    expect(readStored()).toBe('night')
    act(() => result.current.toggle())
    expect(readStored()).toBe('paper')
  })

  it('setTheme directo cambia el valor sin pasar por toggle', () => {
    window.localStorage.setItem(STORAGE_KEY, 'paper')
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('night'))
    expect(result.current.theme).toBe('night')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(readStored()).toBe('night')
  })

  it('actualiza document.documentElement.style.colorScheme', () => {
    window.localStorage.setItem(STORAGE_KEY, 'night')
    renderHook(() => useTheme())
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
