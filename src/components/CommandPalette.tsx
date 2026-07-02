import { useCallback, useEffect, useState } from 'react'
import type { ViewMode } from '../types/view'
import {
  useCommandSearch,
  type CommandAction,
  type Item,
} from '../hooks/useCommandSearch'
import { useModalOverlay } from '../hooks/useModalOverlay'
import { useAskQuery, useRunQuery, useSaveQuery } from '../state/useSavedQueries'
import { useToast } from '../state/toast'
import type { QueryHit, QueryInput } from '../api/query'
import type { NotasSection } from '../types/notas'
import {
  CommandPaletteDialog,
  type CommandPaletteResultsState,
} from './commandPalette/CommandPaletteDialog'
import {
  getCommandPaletteActiveLength,
  type CommandPaletteMode,
} from './commandPalette/commandPaletteModel'
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
  const [focusIdx, setFocusIdx] = useState(0)

  // δ-unificado: segundo modo del palette. 'search' es el comportamiento
  // clásico (find/navigate). 'results' muestra los hits del motor de consultas
  // tras un "Preguntar" o correr una consulta guardada.
  const [mode, setMode] = useState<CommandPaletteMode>('search')
  const [results, setResults] = useState<CommandPaletteResultsState | null>(null)
  const [running, setRunning] = useState(false)

  const ask = useAskQuery()
  const run = useRunQuery()
  const saveQuery = useSaveQuery()
  const toast = useToast()

  // Reset a modo búsqueda al abrir el palette o cuando la query cambia: nunca
  // arrastramos resultados de una sesión previa.
  useEffect(() => {
    if (open) {
      setMode('search')
      setResults(null)
      setRunning(false)
    }
  }, [open])

  // Reset del índice resaltado al abrir. El foco inicial del input lo maneja
  // el focus trap de useModalOverlay (el input es el primer focuseable del
  // diálogo). La query y los resultados de servidor los resetea
  // useCommandSearch.
  useEffect(() => {
    if (open) {
      setFocusIdx(0)
    }
  }, [open])

  useEffect(() => {
    setFocusIdx(0)
    // Cambiar la query con intención vuelve a modo búsqueda.
    setMode('search')
    setResults(null)
  }, [query])

  // Escape: delegado a useModalOverlay (respeta el stack de overlays + focus
  // trap + scroll-lock). En modo resultados NO cierra el palette: vuelve a
  // búsqueda. En modo búsqueda cierra. Esta lógica mode-aware corre como el
  // onClose del overlay.
  const handleEscape = useCallback(() => {
    if (mode === 'results') {
      setMode('search')
      setResults(null)
      setFocusIdx(0)
    } else {
      onClose()
    }
  }, [mode, onClose])

  const overlay = useModalOverlay({ open, onClose: handleEscape })
  const activeLen = getCommandPaletteActiveLength({
    mode,
    itemCount: items.length,
    hitCount: results?.hits.length ?? 0,
  })

  const runAst = useCallback(
    (queryInput: QueryInput, heading: string) => {
      setRunning(true)
      run
        .mutateAsync(queryInput)
        .then((res) => {
          setResults({ hits: res.items, ast: queryInput, heading })
          setMode('results')
          setFocusIdx(0)
        })
        .catch(() => {
          toast.show({ message: 'No se pudo ejecutar la consulta.', tone: 'error' })
        })
        .finally(() => setRunning(false))
    },
    [run, toast],
  )

  const runAsk = useCallback(
    (q: string) => {
      setRunning(true)
      ask
        .mutateAsync(q)
        .then((res) => {
          setResults({
            hits: res.items,
            ast: res.query,
            source: res.source,
            heading: `«${q}»`,
          })
          setMode('results')
          setFocusIdx(0)
        })
        .catch(() => {
          toast.show({ message: 'No se pudo interpretar la pregunta.', tone: 'error' })
        })
        .finally(() => setRunning(false))
    },
    [ask, toast],
  )

  const selectHit = useCallback(
    (hit: QueryHit) => {
      switch (hit.kind) {
        case 'entity':
          onSelectEntity(hit.id)
          break
        case 'quote':
          onNavigate('citas')
          break
        case 'momento':
          onNavigate('momentos')
          break
        case 'note':
          onRevealNotasModule?.('notas')
          break
      }
      onClose()
    },
    [onClose, onNavigate, onSelectEntity, onRevealNotasModule],
  )

  const selectItem = useCallback(
    (item: Item) => {
      switch (item.kind) {
        case 'view':
          onNavigate(item.view)
          break
        case 'action':
          onAction?.(item.action)
          break
        case 'entity':
          onSelectEntity(item.id)
          break
        case 'quote':
          // Cita → abrir el panel de su entidad.
          onSelectEntity(item.entityId)
          break
        case 'momento':
          // No hay deep-link a un momento puntual (lista infinita); llevamos
          // a la vista Momentos.
          onNavigate('momentos')
          break
        case 'cronica':
          // Las crónicas viven en Inicio.
          onNavigate('inicio')
          break
        case 'chat':
          if (onOpenThread) onOpenThread(item.threadId)
          else onNavigate('chat')
          break
        case 'reveal':
          onRevealNotasModule?.(item.moduleId)
          break
        case 'ask':
          // No cerramos: pasamos a modo resultados dentro del mismo palette.
          runAsk(item.q)
          return
        case 'savedQuery':
          runAst(item.query, item.name)
          return
      }
      onClose()
    },
    [
      onAction,
      onClose,
      onNavigate,
      onOpenThread,
      onRevealNotasModule,
      onSelectEntity,
      runAsk,
      runAst,
    ],
  )

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
      onBackToSearch={() => {
        setMode('search')
        setResults(null)
        setFocusIdx(0)
      }}
      onClose={onClose}
      onFocusIdx={setFocusIdx}
      onQueryChange={setQuery}
      onSaveQuery={(name) => {
        if (results?.ast) saveQuery.mutate({ name, query: results.ast })
      }}
      onSelectHit={selectHit}
      onSelectItem={selectItem}
      query={query}
      results={results}
      running={running}
      saving={saveQuery.isPending}
      searching={searching}
    />
  )
}
