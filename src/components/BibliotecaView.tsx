import { useEffect, useMemo, useRef, useState } from 'react'
import { flattenBibliotecaItems, useBibliotecaList } from '../state'
import { useSearchParamState } from '../hooks/useSearchParamState'
import { ViewHeader } from './ViewHeader'
import { ErrorState } from './ErrorState'
import { Tooltip } from './Tooltip'
import { ChevronDownIcon, PlusIcon, SearchIcon } from './Icons'
import { BibliotecaTabs } from './biblioteca/BibliotecaTabs'
import { BibliotecaToolbar } from './biblioteca/BibliotecaToolbar'
import type {
  BibliotecaTab,
  LibraryFileType,
  LibraryItem,
  LibrarySource,
} from '../types/biblioteca'
import { BibliotecaListView } from './biblioteca/BibliotecaListView'
import { BibliotecaListSkeleton } from './biblioteca/BibliotecaListSkeleton'
import { BibliotecaGridView } from './biblioteca/BibliotecaGridView'
import { BibliotecaGridSkeleton } from './biblioteca/BibliotecaGridSkeleton'
import { BibliotecaEmptyState } from './biblioteca/BibliotecaEmptyState'
import { RenameModal } from './biblioteca/RenameModal'
import {
  DEFAULT_ORDEN,
  DEFAULT_VISTA,
  coerceVista,
  toggleOrden,
  type BibliotecaOrden,
  type SortColumn,
} from './biblioteca/helpers'

/**
 * Vista Biblioteca — orquestador.
 *
 * Posee el estado de filtros (pestaña, búsqueda, orden, tipo, fuente) y el modo
 * de vista (lista / cuadrícula), cada uno espejado en la URL vía
 * `useSearchParamState` para que la vista sea enlazable. La búsqueda tiene un
 * debounce de 250 ms antes de tocar el query param / disparar la query.
 * Renderiza el header editorial (con buscador compacto + "Nuevo" deshabilitado),
 * la fila de pestañas + barra de controles (filtros + conmutador de vista), la
 * lista ordenable o la cuadrícula de cards, y los estados de carga / error /
 * vacío, más el botón "Cargar más" (paginación por cursor).
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
const VALID_TIPOS: ReadonlyArray<LibraryFileType> = [
  'image',
  'document',
  'spreadsheet',
  'presentation',
  'pdf',
  'audio',
  'video',
  'other',
]
const VALID_FUENTES: ReadonlyArray<LibrarySource> = [
  'subido',
  'generado',
  'capturado',
  'whatsapp',
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

function coerceTipo(raw: string | null): LibraryFileType | '' {
  return raw && (VALID_TIPOS as readonly string[]).includes(raw)
    ? (raw as LibraryFileType)
    : ''
}

function coerceFuente(raw: string | null): LibrarySource | '' {
  return raw && (VALID_FUENTES as readonly string[]).includes(raw)
    ? (raw as LibrarySource)
    : ''
}

export function BibliotecaView() {
  const [tabParam, setTabParam] = useSearchParamState('tab')
  const [qParam, setQParam] = useSearchParamState('q')
  const [ordenParam, setOrdenParam] = useSearchParamState('orden')
  const [tipoParam, setTipoParam] = useSearchParamState('tipo')
  const [fuenteParam, setFuenteParam] = useSearchParamState('fuente')
  const [vistaParam, setVistaParam] = useSearchParamState('vista')
  const [eliminadosParam, setEliminadosParam] = useSearchParamState('eliminados')

  const tab = coerceTab(tabParam)
  const orden = coerceOrden(ordenParam)
  const tipo = coerceTipo(tipoParam)
  const fuente = coerceFuente(fuenteParam)
  const vista = coerceVista(vistaParam)
  const incluyeEliminados = eliminadosParam === '1'
  const q = qParam ?? ''

  // Item en edición de nombre (un único modal sirve a lista y cuadrícula).
  const [renamingItem, setRenamingItem] = useState<LibraryItem | null>(null)

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

  const query = useBibliotecaList({
    tab,
    q: q || undefined,
    orden,
    tipo: tipo || undefined,
    fuente: fuente || undefined,
    incluyeEliminados,
  })
  const items = useMemo(() => flattenBibliotecaItems(query.data), [query.data])

  function handleSort(column: SortColumn) {
    const next = toggleOrden(orden, column)
    // El default no necesita ensuciar la URL.
    setOrdenParam(next === DEFAULT_ORDEN ? null : next)
  }

  function handleTab(next: BibliotecaTab) {
    setTabParam(next === 'todo' ? null : next)
  }

  function handleVista(next: typeof vista) {
    // El default (lista) no necesita ensuciar la URL.
    setVistaParam(next === DEFAULT_VISTA ? null : next)
  }

  function handleToggleEliminados(next: boolean) {
    // `?eliminados=1` solo cuando está activa; apagada limpia el param.
    setEliminadosParam(next ? '1' : null)
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

      <div className="mb-4 flex items-center justify-between gap-3">
        <BibliotecaTabs value={tab} onChange={handleTab} />
        <BibliotecaToolbar
          vista={vista}
          onChangeVista={handleVista}
          tipo={tipo}
          fuente={fuente}
          incluyeEliminados={incluyeEliminados}
          onChangeTipo={(next) => setTipoParam(next || null)}
          onChangeFuente={(next) => setFuenteParam(next || null)}
          onToggleEliminados={handleToggleEliminados}
        />
      </div>

      {query.isLoading ? (
        vista === 'cuadricula' ? (
          <BibliotecaGridSkeleton />
        ) : (
          <BibliotecaListSkeleton />
        )
      ) : query.isError && items.length === 0 ? (
        <ErrorState
          title="No se pudieron cargar los archivos"
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : items.length === 0 ? (
        <BibliotecaEmptyState trash={incluyeEliminados} />
      ) : (
        <>
          {vista === 'cuadricula' ? (
            <BibliotecaGridView
              items={items}
              trash={incluyeEliminados}
              onRename={setRenamingItem}
            />
          ) : (
            <BibliotecaListView
              items={items}
              orden={orden}
              onSort={handleSort}
              trash={incluyeEliminados}
              onRename={setRenamingItem}
            />
          )}
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

      {renamingItem && (
        <RenameModal item={renamingItem} open onClose={() => setRenamingItem(null)} />
      )}
    </>
  )
}
