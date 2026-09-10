import { renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useShellOmnibox } from './useShellOmnibox'
import type { TramaTarget } from './worldShellModel'

const m = vi.hoisted(() => ({
  shortcuts: null as null | Record<string, (() => void) | undefined>,
}))

vi.mock('../../hooks/useGlobalShortcuts', () => ({
  useGlobalShortcuts: (config: Record<string, (() => void) | undefined>) => {
    m.shortcuts = config
  },
}))

function setup(initialTarget: TramaTarget | null = null) {
  const deps = {
    initialTarget,
    paletteOpen: true,
    openModal: vi.fn(),
    closeModal: vi.fn(),
    toggleModal: vi.fn(),
    setView: vi.fn(),
    setSelectedEntityId: vi.fn(),
    setPendingChatThreadId: vi.fn(),
    toggleFocusMode: vi.fn(),
    onRevealNotasModule: vi.fn(),
  }
  // En StrictMode, como en main.tsx: los efectos corren dos veces al montar, y el
  // destino tiene que aplicarse igual una sola vez.
  const { result, rerender } = renderHook(() => useShellOmnibox(deps), {
    wrapper: StrictMode,
  })
  return { deps, result, rerender }
}

describe('useShellOmnibox', () => {
  it('una acción de vista limpia la entidad y navega; una de modal abre el modal', () => {
    const { deps, result } = setup()
    result.current.paletteProps.onPaletteAction('new-quote')
    expect(deps.setSelectedEntityId).toHaveBeenCalledWith(null)
    expect(deps.setView).toHaveBeenCalledWith('citas')

    result.current.paletteProps.onPaletteAction('open-settings')
    expect(deps.openModal).toHaveBeenCalledWith('settings')
  })

  it('abrir un hilo lo deja pendiente y lleva al chat', () => {
    const { deps, result } = setup()
    result.current.paletteProps.onOpenThread('hilo-1')
    expect(deps.setPendingChatThreadId).toHaveBeenCalledWith('hilo-1')
    expect(deps.setView).toHaveBeenCalledWith('chat')
  })

  it('registra ⌘K, «/», «?» y «\\» del mundo Trama', () => {
    const { deps } = setup()
    m.shortcuts?.onTogglePalette?.()
    m.shortcuts?.onOpenPalette?.()
    m.shortcuts?.onToggleShortcuts?.()
    m.shortcuts?.onToggleFocusMode?.()
    expect(deps.toggleModal).toHaveBeenCalledWith('palette')
    expect(deps.openModal).toHaveBeenCalledWith('palette')
    expect(deps.toggleModal).toHaveBeenCalledWith('shortcuts')
    expect(deps.toggleFocusMode).toHaveBeenCalledOnce()
  })

  it('al montar desde otro mundo aplica una sola vez la entidad, el hilo o el modal pedidos', () => {
    const entidad = setup({ kind: 'entity', id: 'e1' })
    expect(entidad.deps.setSelectedEntityId).toHaveBeenCalledWith('e1')
    entidad.rerender()
    expect(entidad.deps.setSelectedEntityId).toHaveBeenCalledTimes(1)

    const hilo = setup({ kind: 'thread', threadId: 'h1' })
    expect(hilo.deps.setPendingChatThreadId).toHaveBeenCalledWith('h1')

    const modal = setup({ kind: 'action', action: 'open-settings' })
    expect(modal.deps.openModal).toHaveBeenCalledWith('settings')

    const vista = setup({ kind: 'view', view: 'grafo' })
    expect(vista.deps.setView).not.toHaveBeenCalled()
    expect(vista.deps.openModal).not.toHaveBeenCalled()
  })
})
