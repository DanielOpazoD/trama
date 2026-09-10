import { useCallback, useEffect, useRef } from 'react'
import type { AppModalKey } from '../../hooks/useAppModals'
import type { CommandAction } from '../../hooks/useCommandSearch'
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts'
import type { NotasSection } from '../../types/notas'
import type { ViewMode } from '../../types/view'
import { resolveShellPaletteAction } from './shellPaletteModel'
import type { TramaTarget } from './worldShellModel'

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
  initialTarget = null,
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
  /** Destino que pidió el buscador desde otro mundo. La vista la pone `useInitialView`. */
  initialTarget?: TramaTarget | null
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

  // Lo que no es una vista se aplica una sola vez al montar: la entidad, el hilo o
  // el modal que se eligió en el buscador del otro mundo.
  const appliedTarget = useRef(false)
  useEffect(() => {
    if (!initialTarget || appliedTarget.current) return
    appliedTarget.current = true
    if (initialTarget.kind === 'entity') setSelectedEntityId(initialTarget.id)
    else if (initialTarget.kind === 'thread')
      setPendingChatThreadId(initialTarget.threadId)
    else if (initialTarget.kind === 'action') {
      const intent = resolveShellPaletteAction(initialTarget.action)
      if (intent.kind === 'modal') openModal(intent.modal)
    }
  }, [initialTarget, openModal, setPendingChatThreadId, setSelectedEntityId])

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
