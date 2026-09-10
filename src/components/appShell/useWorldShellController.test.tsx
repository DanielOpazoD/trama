import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handOffFilesToImprenta,
  takeHandedOffImprentaFiles,
} from '../../lib/imprentaHandoff'
import { useWorldShellController } from './useWorldShellController'

describe('useWorldShellController', () => {
  beforeEach(() => {
    window.localStorage.clear()
    takeHandedOffImprentaFiles()
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => {
    window.localStorage.clear()
  })

  it('cuando el puente avisa, cambia al mundo Notas con Imprenta como sección pendiente', () => {
    const preloadWorldBundle = vi.fn()
    const { result } = renderHook(() => useWorldShellController({ preloadWorldBundle }))
    expect(result.current.world).toBe('trama')
    expect(result.current.pendingNotasSection).toBeNull()

    act(() => {
      handOffFilesToImprenta([new File(['x'], 'foto.jpg', { type: 'image/jpeg' })])
    })

    expect(result.current.world).toBe('notas')
    expect(result.current.pendingNotasSection).toBe('pdf')
    expect(preloadWorldBundle).toHaveBeenCalledWith('notas')
    expect(window.localStorage.getItem('trama:world')).toBe('notas')
  })

  it('el buscador lleva a Trama con su destino, y salir de Trama lo olvida', () => {
    const { result } = renderHook(() =>
      useWorldShellController({ preloadWorldBundle: vi.fn() }),
    )
    act(() => result.current.changeWorld('notas'))
    expect(result.current.world).toBe('notas')

    act(() => result.current.goToTrama({ kind: 'view', view: 'momentos' }))
    expect(result.current.world).toBe('trama')
    expect(result.current.pendingTramaTarget).toEqual({ kind: 'view', view: 'momentos' })

    act(() => result.current.changeWorld('notas'))
    expect(result.current.pendingTramaTarget).toBeNull()
  })
})
