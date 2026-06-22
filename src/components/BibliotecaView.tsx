import { useEffect, useMemo, useRef, useState } from 'react'
import {
  flattenBibliotecaItems,
  useBibliotecaList,
  useUploadLibraryFiles,
} from '../state'
import { resolveCaptureDate } from '../lib/exifDate'
import { useSearchParamState } from '../hooks/useSearchParamState'
import { ViewHeader } from './ViewHeader'
import { ErrorState } from './ErrorState'
import { CloseIcon, PlusIcon, SearchIcon } from './Icons'
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
import { BibliotecaViewer } from './biblioteca/BibliotecaViewer'
import { BibliotecaSelectionBar } from './biblioteca/BibliotecaSelectionBar'
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
 * Renderiza el header editorial (con buscador compacto + "Nuevo" que sube
 * archivos vía un input file oculto),
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
  'creado-desc',
  'creado-asc',
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

export function BibliotecaView({
  onSendToImprenta,
}: {
  /**
   * Envía archivos seleccionados a Imprenta (estudio PDF). Lo provee el mundo
   * Notas: setea los archivos pendientes y navega a la sección PDF. Opcional para
   * que la vista siga renderizando aislada en tests.
   */
  onSendToImprenta?: (files: File[]) => void
} = {}) {
  const [tabParam, setTabParam] = useSearchParamState('tab')
  const [qParam, setQParam] = useSearchParamState('q')
  const [ordenParam, setOrdenParam] = useSearchParamState('orden')
  const [tipoParam, setTipoParam] = useSearchParamState('tipo')
  const [fuenteParam, setFuenteParam] = useSearchParamState('fuente')
  const [etiquetaParam, setEtiquetaParam] = useSearchParamState('etiqueta')
  const [vistaParam, setVistaParam] = useSearchParamState('vista')
  const [eliminadosParam, setEliminadosParam] = useSearchParamState('eliminados')

  const tab = coerceTab(tabParam)
  const orden = coerceOrden(ordenParam)
  const tipo = coerceTipo(tipoParam)
  const fuente = coerceFuente(fuenteParam)
  const vista = coerceVista(vistaParam)
  const incluyeEliminados = eliminadosParam === '1'
  const q = qParam ?? ''
  // Filtro por etiqueta (PR-C): se setea al clickear un chip de etiqueta en una
  // card / fila, y se quita desde el indicador junto a la barra de controles.
  const tag = (etiquetaParam ?? '').trim()

  // Item en edición de nombre (un único modal sirve a lista y cuadrícula).
  const [renamingItem, setRenamingItem] = useState<LibraryItem | null>(null)
  // Item abierto en el visor (un único overlay sirve a lista y cuadrícula).
  // Guardamos el item al abrir, pero el visor lee el item VIVO de la cache
  // (`viewingItem`, derivado más abajo): así fijar/etiquetar de forma optimista
  // se refleja en la misma sesión y las ediciones sucesivas no pisan un
  // snapshot viejo.
  const [openedItem, setOpenedItem] = useState<LibraryItem | null>(null)

  // Selección múltiple (PR-B): ids `${kind}:${itemId}` marcados. La barra de
  // selección flota cuando hay ≥1, y permite "Enviar a Imprenta" + eliminar.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  function toggleSelect(item: LibraryItem) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }
  function clearSelection() {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()))
  }
  // La selección se limpia al cambiar de pestaña/filtro/búsqueda/orden o al
  // entrar/salir de la papelera: los items mostrados cambian y arrastrar una
  // selección "fantasma" entre vistas confundiría.
  useEffect(() => {
    clearSelection()
  }, [
    tabParam,
    qParam,
    ordenParam,
    tipoParam,
    fuenteParam,
    etiquetaParam,
    eliminadosParam,
  ])

  // Subida (PR1 de subida): el botón "Nuevo" abre un input file oculto. Por cada
  // imagen leemos su fecha de captura (EXIF → lastModified) para que la
  // Biblioteca la posicione por cuándo se tomó, no por la hora de subida.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadFiles = useUploadLibraryFiles()

  async function handleFilesSelected(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : []
    if (files.length === 0) return
    const withDates = await Promise.all(
      files.map(async (file) => ({
        file,
        // Solo las imágenes traen fecha de captura relevante; para el resto
        // resolveCaptureDate cae a lastModified igual, así que la mandamos
        // siempre (el servidor decide si la usa).
        takenAt: await resolveCaptureDate(file),
      })),
    )
    uploadFiles.mutate(withDates)
  }

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
    tag: tag || undefined,
    incluyeEliminados,
  })
  const items = useMemo(() => flattenBibliotecaItems(query.data), [query.data])
  // Item del visor, re-derivado de la lista viva para reflejar los updates
  // optimistas (tags / fijar). Cae al snapshot de apertura si la lista no lo
  // tiene a mano (p. ej. durante un refetch) para que el overlay no parpadee.
  const viewingItem = useMemo(
    () => (openedItem ? (items.find((i) => i.id === openedItem.id) ?? openedItem) : null),
    [openedItem, items],
  )
  // Items seleccionados, resueltos contra la lista cargada (la barra necesita el
  // LibraryItem completo, no solo el id, para bajar blobs / soft-delete).
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  )

  // Scroll infinito: un centinela al final de la lista auto-carga la página
  // siguiente al entrar en viewport (con 200 px de adelanto, para que la carga
  // sea imperceptible). Reemplaza el "Cargar más" manual; queda un botón de
  // respaldo por accesibilidad / si el observer no estuviera disponible.
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  useEffect(() => {
    const el = loadMoreRef.current
    // Sin IntersectionObserver (p. ej. jsdom en tests) cae al botón de respaldo.
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  function handleSort(column: SortColumn) {
    const next = toggleOrden(orden, column)
    // El default no necesita ensuciar la URL.
    setOrdenParam(next === DEFAULT_ORDEN ? null : next)
  }

  function handleTab(next: BibliotecaTab) {
    setTabParam(next === 'todo' ? null : next)
  }

  function handleTagClick(next: string) {
    // Clickear la etiqueta ya activa la quita (toggle); si no, la fija.
    const trimmed = next.trim()
    setEtiquetaParam(trimmed && trimmed !== tag ? trimmed : null)
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
            {/* "Nuevo" abre el selector de archivos (input oculto) y sube a la
                Biblioteca. Mientras sube, se deshabilita y muestra "Subiendo…".
                El tray drag-drop + barra de progreso son un PR posterior. */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,text/*,application/json"
              className="sr-only"
              onChange={(e) => {
                void handleFilesSelected(e.target.files)
                // Limpiar el value permite re-seleccionar el mismo archivo.
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label="Nuevo"
              disabled={uploadFiles.isPending}
              onClick={() => fileInputRef.current?.click()}
              className="btn-ink inline-flex items-center gap-1.5 shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PlusIcon size={14} />
              <span>{uploadFiles.isPending ? 'Subiendo…' : 'Nuevo'}</span>
            </button>
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

      {/* Indicador del filtro por etiqueta activo — removible. */}
      {tag && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--accent-sage-soft)] pl-3 pr-1.5 py-1 text-caption text-ink-700">
            <span className="text-ink-400">Etiqueta:</span>
            <span className="font-medium">{tag}</span>
            <button
              type="button"
              onClick={() => setEtiquetaParam(null)}
              aria-label={`Quitar filtro de etiqueta ${tag}`}
              className="touch-target inline-flex size-4 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-ink-200/70 hover:text-ink-700"
            >
              <CloseIcon size={11} />
            </button>
          </span>
        </div>
      )}

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
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onRename={setRenamingItem}
              onOpen={setOpenedItem}
              onTagClick={handleTagClick}
            />
          ) : (
            <BibliotecaListView
              items={items}
              orden={orden}
              onSort={handleSort}
              trash={incluyeEliminados}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onRename={setRenamingItem}
              onOpen={setOpenedItem}
              onTagClick={handleTagClick}
            />
          )}
          {query.hasNextPage && (
            <div ref={loadMoreRef} className="flex justify-center pt-6">
              {query.isFetchingNextPage ? (
                <span className="text-caption text-ink-400">Cargando…</span>
              ) : (
                <button
                  type="button"
                  onClick={() => query.fetchNextPage()}
                  className="btn-ghost"
                >
                  Cargar más
                </button>
              )}
            </div>
          )}
        </>
      )}

      {renamingItem && (
        <RenameModal item={renamingItem} open onClose={() => setRenamingItem(null)} />
      )}

      {viewingItem && (
        <BibliotecaViewer item={viewingItem} onClose={() => setOpenedItem(null)} />
      )}

      <BibliotecaSelectionBar
        selected={selectedItems}
        onClear={clearSelection}
        onSendToImprenta={onSendToImprenta}
      />
    </>
  )
}
