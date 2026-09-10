import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useCountsQuery, useEntitiesQuery, useQuotesQuery } from '../state'
import { useSavedQueries } from '../state/useSavedQueries'
import { useCommandSearchVisibility } from './useCommandSearchVisibility'
import {
  buildCommandSearchItems,
  type CommandAction,
  type CommandSearchContentItem,
  type CommandSearchContentSource,
  type CommandSearchEntity,
  type CommandSearchItem,
} from './commandSearchModel'
import { useCommandServerSearch } from './useCommandServerSearch'
import { contentTextFor, serverQueryFor } from './commandSearchGrammar'

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

const NO_CONTENT = { items: [] as CommandSearchContentItem[], pending: false }
function useNoContentItems() {
  return NO_CONTENT
}

export function useCommandSearch({
  open,
  actionsEnabled,
  contentSource,
}: {
  open: boolean
  /** Contenido que aporta el anfitrión (el mundo Notas). Fijo por anfitrión. */
  contentSource?: CommandSearchContentSource
  /** Incluir las acciones rápidas en los resultados (true si el padre pasó
   *  un `onAction`). */
  actionsEnabled: boolean
}): {
  query: string
  setQuery: (q: string) => void
  items: Item[]
  searching: boolean
  settled: boolean // la lista ya corresponde a lo escrito
  entitiesForPeek: CommandSearchEntity[] | undefined
} {
  const { data: counts } = useCountsQuery()
  const localSearchEnabled =
    open && !!counts && counts.entities + counts.quotes <= LOCAL_SEARCH_MAX_ITEMS
  const { data: entities = [] } = useEntitiesQuery({ enabled: localSearchEnabled })
  const { data: quotes = [] } = useQuotesQuery({ enabled: localSearchEnabled })
  const { data: savedQueriesData } = useSavedQueries()
  const { sectionAliases, visibility } = useCommandSearchVisibility()
  const [query, setQuery] = useState('')
  // N5: useDeferredValue mantiene el input snappy mientras la lista filtrada
  // se re-computa con un tick de retraso en tramas grandes.
  const deferredQuery = useDeferredValue(query)
  const { serverResults, searching: serverSearching } = useCommandServerSearch({
    open,
    query: serverQueryFor(deferredQuery),
  })
  // Una fuente fija por anfitrión: el hook se llama siempre, en el mismo render que
  // la lista, y `settled` espera también a que la fuente traiga sus listas.
  const useContentItems: CommandSearchContentSource['useItems'] =
    contentSource?.useItems ?? useNoContentItems
  const content = useContentItems({ open, text: contentTextFor(deferredQuery) })
  const searching = serverSearching || content.pending

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
      visibility,
      contentItems: content.items,
    })
  }, [
    actionsEnabled,
    content.items,
    deferredQuery,
    entities,
    localSearchEnabled,
    quotes,
    savedQueriesData,
    sectionAliases,
    serverResults,
    visibility,
  ])

  const settled = deferredQuery === query && !content.pending
  return { query, setQuery, items, searching, settled, entitiesForPeek: entities }
}
