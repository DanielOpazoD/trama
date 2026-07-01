import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useCountsQuery, useEntitiesQuery, useQuotesQuery } from '../state'
import { useSavedQueries } from '../state/useSavedQueries'
import { useSectionVisibility } from './useSectionVisibility'
import { useSectionPin } from './useSectionPin'
import { useSectionAlias } from './useSectionAlias'
import { useModuleVisibility } from './useModuleVisibility'
import { isPinEnabled } from '../components/AppPinGate'
import {
  buildCommandSearchItems,
  type CommandAction,
  type CommandSearchItem,
} from './commandSearchModel'
import { useCommandServerSearch } from './useCommandServerSearch'

/**
 * Lógica de búsqueda del command palette (Cmd+K), extraída de
 * `CommandPalette.tsx` para que el componente quede como render + interacción
 * (foco, teclado, selección) y la búsqueda viva acá.
 *
 * Dos fuentes que se complementan:
 *   - Local (instantáneo, cada tecla): vistas + acciones + entidades
 *     (nombre/descripción/tipo) + citas (texto). Substring filter, sin red.
 *   - Servidor (debounced, q≥2, modo lexical): momentos, crónicas, chat, y
 *     matches extra en contexto. Se mergea sin pisar lo local.
 */

export type { CommandAction }
export type Item = CommandSearchItem

const LOCAL_SEARCH_MAX_ITEMS = 1000

export function useCommandSearch({
  open,
  actionsEnabled,
}: {
  open: boolean
  /** Incluir las acciones rápidas en los resultados (true si el padre pasó
   *  un `onAction`). */
  actionsEnabled: boolean
}): {
  query: string
  setQuery: (q: string) => void
  items: Item[]
  searching: boolean
  entitiesForPeek:
    | {
        id: string
        name: string
        type: string
        year?: number | null
        description?: string | null
      }[]
    | undefined
} {
  const { data: counts } = useCountsQuery()
  const localSearchEnabled =
    open && !!counts && counts.entities + counts.quotes <= LOCAL_SEARCH_MAX_ITEMS
  const { data: entities = [] } = useEntitiesQuery({ enabled: localSearchEnabled })
  const { data: quotes = [] } = useQuotesQuery({ enabled: localSearchEnabled })
  const { data: savedQueriesData } = useSavedQueries()
  const sectionVis = useSectionVisibility()
  const moduleVis = useModuleVisibility()
  const { isPinRequired } = useSectionPin()
  const { sectionAliases } = useSectionAlias()
  const pinActive = isPinEnabled()
  const [query, setQuery] = useState('')
  // N5: useDeferredValue mantiene el input snappy mientras la lista filtrada
  // se re-computa con un tick de retraso en tramas grandes.
  const deferredQuery = useDeferredValue(query)
  const { serverResults, searching } = useCommandServerSearch({
    open,
    query: deferredQuery,
  })

  // Reset del estado de búsqueda al abrir el palette. El foco del input y
  // el índice resaltado los maneja el componente.
  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const items: Item[] = useMemo(() => {
    return buildCommandSearchItems({
      query: deferredQuery,
      actionsEnabled,
      localSearchEnabled,
      entities,
      quotes,
      savedQueries: savedQueriesData?.items ?? [],
      serverResults,
      sectionAliases,
      visibility: {
        isViewVisible: sectionVis.isVisible,
        isModuleVisible: moduleVis.isVisible,
        isPinRequired,
        pinActive,
      },
    })
  }, [
    actionsEnabled,
    deferredQuery,
    entities,
    isPinRequired,
    localSearchEnabled,
    moduleVis.isVisible,
    pinActive,
    quotes,
    savedQueriesData,
    sectionAliases,
    sectionVis.isVisible,
    serverResults,
  ])

  return { query, setQuery, items, searching, entitiesForPeek: entities }
}
