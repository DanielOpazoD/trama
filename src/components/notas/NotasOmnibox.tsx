import { useCallback, useState } from 'react'
import type { CommandSearchContentSource } from '../../hooks/commandSearchModel'
import type { CommandAction } from '../../hooks/useCommandSearch'
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts'
import type { NotasSection } from '../../types/notas'
import type { ViewMode } from '../../types/view'
import type { TramaTarget } from '../appShell/worldShellModel'
import { CommandPaletteHost } from '../commandPalette/CommandPaletteHost'
import { loadCommandPalette } from '../commandPalette/loadCommandPalette'
import { useNotasOmniboxItems } from './omnibox/useNotasOmniboxItems'

// Constante de módulo: la paleta llama a `useItems` como hook, así que su
// identidad no puede cambiar mientras está abierta.
const notasOmniboxSource: CommandSearchContentSource = { useItems: useNotasOmniboxItems }

/** El buscador del mundo Notas: si está abierto, y ⌘K y «/» fuera de los campos. */
export function useNotasOmnibox() {
  const [open, setOpen] = useState(false)
  const openOmnibox = useCallback(() => {
    loadCommandPalette().catch(() => {
      /* si la paleta no baja, el host avisa al montarla */
    })
    setOpen(true)
  }, [])
  const closeOmnibox = useCallback(() => setOpen(false), [])
  const toggleOmnibox = useCallback(() => setOpen((current) => !current), [])
  // Sin «?» ni «\»: en Notas no hay modal de atajos ni modo foco que abrir, y
  // una tecla sin dueño no se reclama. El «/» del feed escucha antes y gana.
  useGlobalShortcuts({ onTogglePalette: toggleOmnibox, onOpenPalette: openOmnibox })
  return { open, openOmnibox, closeOmnibox }
}

/**
 * La misma paleta del mundo Trama, con notas, tareas y prompts. Lo que vive en
 * Trama (una vista, una entidad, un hilo o una acción) cruza de mundo;
 * «Configuración» abre la de Notas.
 */
export function NotasOmnibox({
  open,
  onClose,
  onOpenSection,
  onOpenSettings,
  onGoToTrama,
}: {
  open: boolean
  onClose: () => void
  onOpenSection: (section: NotasSection) => void
  onOpenSettings: () => void
  onGoToTrama?: (target: TramaTarget) => void
}) {
  const onNavigate = useCallback(
    (view: ViewMode) => onGoToTrama?.({ kind: 'view', view }),
    [onGoToTrama],
  )
  const onSelectEntity = useCallback(
    (id: string) => onGoToTrama?.({ kind: 'entity', id }),
    [onGoToTrama],
  )
  const onOpenThread = useCallback(
    (threadId: string) => onGoToTrama?.({ kind: 'thread', threadId }),
    [onGoToTrama],
  )
  const onAction = useCallback(
    (action: CommandAction) => {
      if (action === 'open-settings') onOpenSettings()
      else onGoToTrama?.({ kind: 'action', action })
    },
    [onGoToTrama, onOpenSettings],
  )
  return (
    <CommandPaletteHost
      open={open}
      onClose={onClose}
      onNavigate={onNavigate}
      onSelectEntity={onSelectEntity}
      onOpenThread={onOpenThread}
      onRevealNotasModule={onOpenSection}
      onAction={onAction}
      contentSource={notasOmniboxSource}
    />
  )
}
