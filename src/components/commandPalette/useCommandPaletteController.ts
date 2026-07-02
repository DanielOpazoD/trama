import { useCallback, useEffect, useState } from 'react'
import type { QueryHit, QueryInput } from '../../api/query'
import type { CommandAction, Item } from '../../hooks/useCommandSearch'
import { useAskQuery, useRunQuery, useSaveQuery } from '../../state/useSavedQueries'
import { useToast } from '../../state/toast'
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
  const [running, setRunning] = useState(false)

  const ask = useAskQuery()
  const run = useRunQuery()
  const saveQuery = useSaveQuery()
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    setMode('search')
    setResults(null)
    setRunning(false)
    setFocusIdx(0)
  }, [open])

  useEffect(() => {
    setFocusIdx(0)
    setMode('search')
    setResults(null)
  }, [query])

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
          runAst(command.query, command.heading)
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

  const backToSearch = useCallback(() => {
    setMode('search')
    setResults(null)
    setFocusIdx(0)
  }, [])

  const handleEscape = useCallback(() => {
    if (mode === 'results') {
      backToSearch()
      return
    }
    onClose()
  }, [backToSearch, mode, onClose])

  const saveCurrentQuery = useCallback(
    (name: string) => {
      if (results?.ast) saveQuery.mutate({ name, query: results.ast })
    },
    [results?.ast, saveQuery],
  )

  const activeLen = getCommandPaletteActiveLength({
    mode,
    itemCount: items.length,
    hitCount: results?.hits.length ?? 0,
  })

  return {
    activeLen,
    backToSearch,
    focusIdx,
    handleEscape,
    mode,
    results,
    running,
    saveCurrentQuery,
    saving: saveQuery.isPending,
    selectHit,
    selectItem,
    setFocusIdx,
  }
}
