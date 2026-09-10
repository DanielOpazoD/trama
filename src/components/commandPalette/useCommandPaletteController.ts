import { useCallback, useEffect, useState } from 'react'
import type { QueryHit } from '../../api/query'
import { parseCommandQuery } from '../../hooks/commandSearchGrammar'
import type { CommandAction, Item } from '../../hooks/useCommandSearch'
import type { NotasSection } from '../../types/notas'
import type { ViewMode } from '../../types/view'
import type { CommandPaletteResultsState } from './CommandPaletteDialog'
import {
  getCommandPaletteActiveLength,
  type CommandPaletteMode,
} from './commandPaletteModel'
import {
  getCommandPaletteHitTarget,
  getCommandPaletteItemCommand,
  type CommandPaletteSelectionCommand,
} from './commandPaletteSelectionModel'
import { useCommandPaletteQueries } from './useCommandPaletteQueries'

function isInlineCommand(command: CommandPaletteSelectionCommand) {
  return command.kind === 'runAsk' || command.kind === 'runAst'
}

export function useCommandPaletteController({
  open,
  query,
  items,
  onAction,
  onClose,
  onNavigate,
  onOpenThread,
  onRevealNotasModule,
  onSelectEntity,
}: {
  open: boolean
  query: string
  items: Item[]
  onAction?: (action: CommandAction) => void
  onClose: () => void
  onNavigate: (view: ViewMode) => void
  onOpenThread?: (threadId: string) => void
  onRevealNotasModule?: (moduleId: NotasSection) => void
  onSelectEntity: (id: string) => void
}) {
  const [focusIdx, setFocusIdx] = useState(0)
  const [mode, setMode] = useState<CommandPaletteMode>('search')
  const [results, setResults] = useState<CommandPaletteResultsState | null>(null)

  const showResults = useCallback((next: CommandPaletteResultsState) => {
    setResults(next)
    setMode('results')
    setFocusIdx(0)
  }, [])
  const { invalidate, running, runAsk, runAst, saveQuery, saving } =
    useCommandPaletteQueries({ query, onResults: showResults })

  useEffect(() => {
    if (!open) return
    setMode('search')
    setResults(null)
    invalidate()
    setFocusIdx(0)
  }, [invalidate, open])

  useEffect(() => {
    setFocusIdx(0)
    setMode('search')
    setResults(null)
  }, [query])

  const dispatchCommand = useCallback(
    (command: CommandPaletteSelectionCommand) => {
      switch (command.kind) {
        case 'navigate':
          onNavigate(command.view)
          break
        case 'action':
          onAction?.(command.action)
          break
        case 'selectEntity':
          onSelectEntity(command.id)
          break
        case 'openThread':
          onOpenThread?.(command.threadId)
          break
        case 'revealNotasModule':
          onRevealNotasModule?.(command.moduleId)
          break
        case 'runAsk':
          runAsk(command.q)
          return
        case 'runAst':
          runAst(command.query, command.heading, command.savedQueryId)
          return
      }
      if (!isInlineCommand(command)) onClose()
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

  const selectHit = useCallback(
    (hit: QueryHit) => {
      dispatchCommand(getCommandPaletteHitTarget(hit))
    },
    [dispatchCommand],
  )

  const selectItem = useCallback(
    (item: Item) => {
      dispatchCommand(
        getCommandPaletteItemCommand(item, { canOpenThread: Boolean(onOpenThread) }),
      )
    },
    [dispatchCommand, onOpenThread],
  )

  /** ⌘Enter: pregunta lo escrito, sin depender de qué fila está enfocada. */
  const askCurrent = useCallback(() => {
    const { text } = parseCommandQuery(query)
    if (text) runAsk(text)
  }, [query, runAsk])

  const backToSearch = useCallback(() => {
    invalidate()
    setMode('search')
    setResults(null)
    setFocusIdx(0)
  }, [invalidate])

  const handleEscape = useCallback(() => {
    if (mode === 'results') {
      backToSearch()
      return
    }
    onClose()
  }, [backToSearch, mode, onClose])

  const saveCurrentQuery = useCallback(
    (name: string) =>
      results?.ast ? saveQuery(name, results.ast) : Promise.resolve(false),
    [results?.ast, saveQuery],
  )

  const activeLen = getCommandPaletteActiveLength({
    mode,
    itemCount: items.length,
    hitCount: results?.hits.length ?? 0,
  })

  return {
    activeLen,
    askCurrent,
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
  }
}
