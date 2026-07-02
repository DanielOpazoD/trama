import type { ViewMode } from '../types/view'
import { useCommandSearch, type CommandAction } from '../hooks/useCommandSearch'
import { useModalOverlay } from '../hooks/useModalOverlay'
import type { NotasSection } from '../types/notas'
import { CommandPaletteDialog } from './commandPalette/CommandPaletteDialog'
import { useCommandPaletteController } from './commandPalette/useCommandPaletteController'
import { useCommandPaletteKeyboard } from './commandPalette/useCommandPaletteKeyboard'

// `CommandAction` se define en useCommandSearch; lo re-exportamos acá para no
// romper imports existentes que lo toman desde este módulo.
export type { CommandAction }

/**
 * Cmd+K palette. Search-as-you-type across views + entities + quotes.
 * Arrows navigate, Enter selects, Escape closes.
 *
 * La búsqueda (query, filtro local + servidor, items) vive en
 * `useCommandSearch`. Este componente se queda con la presentación y la
 * interacción: foco del input, navegación por teclado y despacho de la
 * selección a los callbacks del padre.
 */
export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onSelectEntity,
  onAction,
  onOpenThread,
  onRevealNotasModule,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (view: ViewMode) => void
  onSelectEntity: (id: string) => void
  /** Acciones rápidas (Nueva entidad, Configuración, etc.). Si no se
      pasa, el palette las oculta. */
  onAction?: (action: CommandAction) => void
  /** Abrir un hilo de chat por id (para resultados de tipo chat). Si no se
      pasa, los resultados de chat navegan a la vista Chat sin hilo. */
  onOpenThread?: (threadId: string) => void
  /** Revelar/abrir un módulo del mundo Notas (cruza de mundo). Para el comando
      "#pass" → Claves desde el ⌘K del mundo principal. */
  onRevealNotasModule?: (moduleId: NotasSection) => void
}) {
  const { query, setQuery, items, searching, entitiesForPeek } = useCommandSearch({
    open,
    actionsEnabled: Boolean(onAction),
  })
  const {
    activeLen,
    backToSearch,
    focusIdx,
    handleEscape,
    mode,
    results,
    running,
    saveCurrentQuery,
    saving,
    selectHit,
    selectItem,
    setFocusIdx,
  } = useCommandPaletteController({
    open,
    query,
    items,
    onAction,
    onClose,
    onNavigate,
    onOpenThread,
    onRevealNotasModule,
    onSelectEntity,
  })

  const overlay = useModalOverlay({ open, onClose: handleEscape })

  useCommandPaletteKeyboard({
    open,
    activeLen,
    focusIdx,
    setFocusIdx,
    mode,
    items,
    results,
    selectItem,
    selectHit,
  })

  if (!open) return null

  return (
    <CommandPaletteDialog
      dialogRef={overlay.dialogRef}
      entitiesForPeek={entitiesForPeek}
      focusIdx={focusIdx}
      items={items}
      mode={mode}
      onBackToSearch={backToSearch}
      onClose={onClose}
      onFocusIdx={setFocusIdx}
      onQueryChange={setQuery}
      onSaveQuery={saveCurrentQuery}
      onSelectHit={selectHit}
      onSelectItem={selectItem}
      query={query}
      results={results}
      running={running}
      saving={saving}
      searching={searching}
    />
  )
}
