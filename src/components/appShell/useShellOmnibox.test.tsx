import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useShellOmnibox } from './useShellOmnibox'

const m = vi.hoisted(() => ({
  shortcuts: null as null | Record<string, (() => void) | undefined>,
}))

vi.mock('../../hooks/useGlobalShortcuts', () => ({
  useGlobalShortcuts: (config: Record<string, (() => void) | undefined>) => {
    m.shortcuts = config
  },
}))

function setup() {
  const deps = {
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
  const { result } = renderHook(() => useShellOmnibox(deps))
  return { deps, result }
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
})
