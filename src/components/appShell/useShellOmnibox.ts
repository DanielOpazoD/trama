import { useCallback } from 'react'
import type { AppModalKey } from '../../hooks/useAppModals'
import type { CommandAction } from '../../hooks/useCommandSearch'
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts'
import type { NotasSection } from '../../types/notas'
import type { ViewMode } from '../../types/view'
import { resolveShellPaletteAction } from './shellPaletteModel'

/**
 * El buscador (⌘K) del mundo Trama: los atajos globales, qué hace cada acción
 * rápida y las props con que `ShellOverlays` monta la paleta. Sale de `App.tsx`,
 * que solo cablea el shell.
 */
export function useShellOmnibox({
  paletteOpen,
  openModal,
  closeModal,
  toggleModal,
  setView,
  setSelectedEntityId,
  setPendingChatThreadId,
  toggleFocusMode,
  onRevealNotasModule,
}: {
  paletteOpen: boolean
  openModal: (key: AppModalKey) => void
  closeModal: (key: AppModalKey) => void
  toggleModal: (key: AppModalKey) => void
  setView: (view: ViewMode) => void
  setSelectedEntityId: (id: string | null) => void
  setPendingChatThreadId: (threadId: string | null) => void
  toggleFocusMode: () => void
  onRevealNotasModule: (moduleId: NotasSection) => void
}) {
  const openPalette = useCallback(() => openModal('palette'), [openModal])
  const togglePalette = useCallback(() => toggleModal('palette'), [toggleModal])
  const toggleShortcuts = useCallback(() => toggleModal('shortcuts'), [toggleModal])
  useGlobalShortcuts({
    onTogglePalette: togglePalette,
    onOpenPalette: openPalette,
    onToggleShortcuts: toggleShortcuts,
    onToggleFocusMode: toggleFocusMode,
  })

  const onPaletteAction = useCallback(
    (action: CommandAction) => {
      const intent = resolveShellPaletteAction(action)
      if (intent.kind === 'modal') openModal(intent.modal)
      else {
        if (intent.view !== 'grafo') setSelectedEntityId(null)
        setView(intent.view)
      }
    },
    [openModal, setSelectedEntityId, setView],
  )

  const paletteProps = {
    paletteOpen,
    onClosePalette: () => closeModal('palette'),
    onNavigate: (view: ViewMode) => setView(view),
    onSelectEntity: (id: string) => setSelectedEntityId(id),
    onOpenThread: (threadId: string) => {
      setPendingChatThreadId(threadId)
      setView('chat')
    },
    onRevealNotasModule,
    onPaletteAction,
  }

  return { openPalette, paletteProps }
}
