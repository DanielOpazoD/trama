import { useEffect, useMemo, useRef, useState } from 'react'
import { flattenBibliotecaItems, useBibliotecaList } from '../state'
import { useSearchParamState } from '../hooks/useSearchParamState'
import { ViewHeader } from './ViewHeader'
import { ErrorState } from './ErrorState'
import { Tooltip } from './Tooltip'
import { ChevronDownIcon, PlusIcon, SearchIcon } from './Icons'
import { BibliotecaTabs, type BibliotecaTab } from './biblioteca/BibliotecaTabs'
import { BibliotecaListView } from './biblioteca/BibliotecaListView'
import { BibliotecaListSkeleton } from './biblioteca/BibliotecaListSkeleton'
import { BibliotecaEmptyState } from './biblioteca/BibliotecaEmptyState'
import {
  DEFAULT_ORDEN,
  toggleOrden,
  type BibliotecaOrden,
  type SortColumn,
} from './biblioteca/helpers'

/**
 * Vista Biblioteca — orquestador (PR2: cascarón + lista).
 *
 * Posee el estado de filtros (pestaña, búsqueda, orden), cada uno espejado en
 * la URL vía `useSearchParamState` para que la vista sea enlazable. La búsqueda
 * tiene un debounce de 250 ms antes de tocar el query param / disparar la query.
 * Renderiza el header editorial (con buscador compacto + "Nuevo" deshabilitado),
 * las pestañas, la lista ordenable y los estados de carga / error / vacío, más
 * el botón "Cargar más" (paginación por cursor).
 *
 * Children presentacionales: el estado vive acá; ellos solo pintan.
 */

const VALID_TABS: ReadonlyArray<BibliotecaTab> = ['todo', 'imagenes', 'archivos']
const VALID_ORDEN: ReadonlyArray<BibliotecaOrden> = [
  'modificado-desc',
  'modificado-asc',
  'nombre-asc',
  'nombre-desc',
  'tamano-desc',
  'tamano-asc',
]

function coerceTab(raw: string | null): BibliotecaTab {
  return raw && (VALID_TABS as readonly string[]).includes(raw)
    ? (raw as BibliotecaTab)
    : 'todo'
}

function coerceOrden(raw: string | null): BibliotecaOrden {
  return raw && (VALID_ORDEN as readonly string[]).includes(raw)
    ? (raw as BibliotecaOrden)
    : DEFAULT_ORDEN
}

export function BibliotecaView() {
  const [tabParam, setTabParam] = useSearchParamState('tab')
  const [qParam, setQParam] = useSearchParamState('q')
  const [ordenParam, setOrdenParam] = useSearchParamState('orden')

  const tab = coerceTab(tabParam)
  const orden = coerceOrden(ordenParam)
  const q = qParam ?? ''

  // Búsqueda con debounce: el input es estado local inmediato; el query param
  // (y por ende la query) se actualiza 250 ms después de dejar de teclear.
  const [searchInput, setSearchInput] = useState(q)
  // Si la URL cambia por fuera (back/forward), reflejarlo en el input.
  useEffect(() => {
    setSearchInput(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam])

  const debounceRef = useRef<number | null>(null)
  function handleSearchChange(next: string) {
    setSearchInput(next)
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const trimmed = next.trim()
      // '' limpia el param (lo quita de la URL); si no, lo setea.
      setQParam(trimmed ? trimmed : null)
    }, 250)
  }
  useEffect(
    () => () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    },
    [],
  )

  const query = useBibliotecaList({ tab, q: q || undefined, orden })
  const items = useMemo(() => flattenBibliotecaItems(query.data), [query.data])

  function handleSort(column: SortColumn) {
    const next = toggleOrden(orden, column)
    // El default no necesita ensuciar la URL.
    setOrdenParam(next === DEFAULT_ORDEN ? null : next)
  }

  function handleTab(next: BibliotecaTab) {
    setTabParam(next === 'todo' ? null : next)
  }

  return (
    <>
      <ViewHeader
        title="Biblioteca"
        eyebrow="archivo personal"
        // Mundo Notas: un único acento compartido (sage), no la firma cromática
        // por-ViewMode del mundo Trama (SECTION_ACCENT ya no incluye biblioteca).
        accent="var(--accent-sage)"
        spacing="tight"
        action={
          <div className="flex items-center gap-2">
            <label className="input-paper flex items-center gap-2 py-1.5 w-full sm:w-60">
              <SearchIcon size={14} className="text-ink-300 shrink-0" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Buscar"
                aria-label="Buscar archivos"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink-700 placeholder:text-ink-300 focus:outline-none"
              />
            </label>
            {/* "Nuevo" llega en PR4 (subida). Lo dejamos visible pero
                inerte: usamos `aria-disabled` en vez del atributo nativo
                `disabled` para que el Tooltip siga recibiendo hover/focus y
                pueda explicar "Disponible pronto" (un botón `disabled` real no
                dispara eventos y el tooltip nunca aparecería). */}
            <Tooltip content="Disponible pronto">
              <button
                type="button"
                aria-disabled="true"
                aria-label="Nuevo"
                onClick={(e) => e.preventDefault()}
                className="btn-ink inline-flex items-center gap-1.5 shrink-0 bg-ink-200 hover:bg-ink-200 cursor-not-allowed active:scale-100"
              >
                <PlusIcon size={14} />
                <span>Nuevo</span>
                <ChevronDownIcon size={12} className="opacity-80" />
              </button>
            </Tooltip>
          </div>
        }
      />

      <div className="mb-4">
        <BibliotecaTabs value={tab} onChange={handleTab} />
      </div>

      {query.isLoading ? (
        <BibliotecaListSkeleton />
      ) : query.isError && items.length === 0 ? (
        <ErrorState
          title="No se pudieron cargar los archivos"
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length === 0 ? (
        <BibliotecaEmptyState />
      ) : (
        <>
          <BibliotecaListView items={items} orden={orden} onSort={handleSort} />
          {query.hasNextPage && (
            <div className="flex justify-center pt-6">
              <button
                type="button"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="btn-ghost"
              >
                {query.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
