import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// useSearchParamState toca la URL; lo reemplazamos por un useState real para
// que selectedEntityId se comporte como estado sin depender del router.
vi.mock('./useSearchParamState', async () => {
  const { useState } = await import('react')
  return { useSearchParamState: () => useState<string | null>(null) }
})
// startViewTransition: ejecutar el callback de inmediato (sin la View Transitions API).
vi.mock('../lib/viewTransition', () => ({
  startViewTransition: (cb: () => void) => cb(),
}))
vi.mock('../lib/oauthReturn', () => ({ readOAuthReturn: () => null }))

import { useShellState } from './useShellState'

const FOCUS_KEY = 'trama:focus-mode'

beforeEach(() => {
  vi.restoreAllMocks()
  try {
    window.localStorage.clear()
  } catch {
    /* ignore */
  }
})

describe('useShellState', () => {
  it('focus mode: toggle y exit persisten en localStorage', () => {
    const { result } = renderHook(() => useShellState())
    expect(result.current.focusMode).toBe(false)

    act(() => result.current.toggleFocusMode())
    expect(result.current.focusMode).toBe(true)
    expect(window.localStorage.getItem(FOCUS_KEY)).toBe('1')

    act(() => result.current.toggleFocusMode())
    expect(result.current.focusMode).toBe(false)
    expect(window.localStorage.getItem(FOCUS_KEY)).toBe('0')

    act(() => result.current.toggleFocusMode()) // on otra vez
    act(() => result.current.exitFocusMode())
    expect(result.current.focusMode).toBe(false)
    expect(window.localStorage.getItem(FOCUS_KEY)).toBe('0')
  })

  it('arranca en focus mode si localStorage lo tenía persistido', () => {
    window.localStorage.setItem(FOCUS_KEY, '1')
    const { result } = renderHook(() => useShellState())
    expect(result.current.focusMode).toBe(true)
  })

  it('no crashea en el arranque si localStorage.getItem lanza (fix CodeRabbit)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage bloqueado')
    })
    // Sin el try/catch esto lanzaría al montar y crashearía la app.
    const { result } = renderHook(() => useShellState())
    expect(result.current.focusMode).toBe(false)
  })

  it('selectedEntityId deriva showDetail y rightPanelOpen', () => {
    const { result } = renderHook(() => useShellState())
    expect(result.current.showDetail).toBe(false)
    expect(result.current.rightPanelOpen).toBe(false)

    act(() => result.current.setSelectedEntityId('entity-1'))
    expect(result.current.selectedEntityId).toBe('entity-1')
    expect(result.current.showDetail).toBe(true)
    expect(result.current.rightPanelOpen).toBe(true)
  })

  it('una propuesta pendiente gana sobre el detalle (showProposal)', () => {
    const { result } = renderHook(() => useShellState())
    act(() => result.current.setSelectedEntityId('entity-1'))
    act(() => result.current.setPendingProposal({ text: 'x', proposal: {} } as never))

    expect(result.current.showProposal).toBe(true)
    expect(result.current.showDetail).toBe(false) // la propuesta tiene prioridad
    expect(result.current.rightPanelOpen).toBe(true)
  })
})
