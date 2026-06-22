import type { KeyboardEvent } from 'react'
import { ChevronDownIcon, PinIcon } from '../Icons'
import type { LibraryItem } from '../../types/biblioteca'
import { Thumbnail } from './Thumbnail'
import { BibliotecaItemActions } from './BibliotecaItemActions'
import { SelectionCircle } from './SelectionCircle'
import { TagChips } from './TagChips'
import {
  fileExtensionLabel,
  formatByteSize,
  formatShortDate,
  parseOrden,
  type BibliotecaOrden,
  type SortColumn,
} from './helpers'

/**
 * Lista de la Biblioteca con aspecto de tabla minimalista sobre papel
 * (no cards en caja). Columnas Nombre / Extensión / Creado / Modificado /
 * Tamaño. Las ordenables (Nombre, Creado, Modificado, Tamaño) son botones que
 * alternan asc/desc y muestran un chevron en la columna activa; Extensión es
 * informativa (no ordenable). `aria-sort` comunica el estado a lectores.
 *
 * Cada fila es clickeable: abre el visor del archivo (`onOpen`). También por
 * teclado (Enter/Espacio sobre la fila enfocada). Los botones de acción frenan
 * la propagación, así no abren el visor al usarlos.
 *
 * Responsive: en pantallas chicas se ocultan las columnas menos críticas
 * (Extensión, Creado, Tamaño) y quedan Nombre + Modificado.
 *
 * Presentacional: recibe items + orden + callbacks. El estado vive en el
 * orquestador (BibliotecaView).
 */

type Column = {
  key: SortColumn | 'extension'
  label: string
  /** Clases de ancho/visibilidad de la celda (header y filas comparten). */
  cellClass: string
  /** Las columnas no ordenables (Extensión) no son botones. */
  sortable: boolean
}

const COLUMNS: ReadonlyArray<Column> = [
  { key: 'nombre', label: 'Nombre', cellClass: 'flex-1 min-w-0', sortable: true },
  {
    key: 'extension',
    label: 'Extensión',
    cellClass: 'w-20 justify-end hidden md:flex',
    sortable: false,
  },
  {
    key: 'creado',
    label: 'Creado',
    cellClass: 'w-16 justify-end hidden sm:flex',
    sortable: true,
  },
  {
    key: 'modificado',
    label: 'Modificado',
    cellClass: 'w-16 justify-end',
    sortable: true,
  },
  {
    key: 'tamano',
    label: 'Tamaño',
    cellClass: 'w-20 justify-end hidden md:flex',
    sortable: true,
  },
]

function ariaSortFor(
  column: SortColumn,
  active: SortColumn,
  direction: 'asc' | 'desc',
): 'ascending' | 'descending' | 'none' {
  if (column !== active) return 'none'
  return direction === 'asc' ? 'ascending' : 'descending'
}

export function BibliotecaListView({
  items,
  orden,
  onSort,
  trash = false,
  selectedIds,
  onToggleSelect,
  onRename,
  onOpen,
  onTagClick,
}: {
  items: LibraryItem[]
  orden: BibliotecaOrden
  onSort: (column: SortColumn) => void
  /** Vista papelera: las acciones de fila se reducen a Restaurar. */
  trash?: boolean
  /** Ids (`${kind}:${itemId}`) seleccionados (multi-select PR-B). */
  selectedIds: ReadonlySet<string>
  onToggleSelect: (item: LibraryItem) => void
  onRename: (item: LibraryItem) => void
  onOpen: (item: LibraryItem) => void
  /** Filtra por una etiqueta al clickearla (PR-C). Opcional. */
  onTagClick?: (tag: string) => void
}) {
  const { column: activeColumn, direction } = parseOrden(orden)
  const anySelected = selectedIds.size > 0

  function handleRowKeyDown(event: KeyboardEvent<HTMLDivElement>, item: LibraryItem) {
    // Enter/Espacio abren el visor; Espacio además evita el scroll de página.
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(item)
    }
  }

  return (
    <div role="table" aria-label="Archivos" className="text-sm">
      {/* Encabezado — botones de orden (Extensión es estática) */}
      <div
        role="row"
        className="flex items-center gap-3 h-9 px-2 border-b border-ink-100/70"
      >
        {/* Espaciador para alinear con el círculo de selección de cada fila. */}
        <div role="columnheader" aria-hidden className="w-5 shrink-0" />
        {COLUMNS.map((col) => {
          const isSortable = col.sortable
          const sortKey = col.key as SortColumn
          const isActive = isSortable && sortKey === activeColumn
          return (
            <div
              key={col.key}
              role="columnheader"
              aria-sort={
                isSortable ? ariaSortFor(sortKey, activeColumn, direction) : undefined
              }
              className={`flex ${col.cellClass}`}
            >
              {isSortable ? (
                <button
                  type="button"
                  onClick={() => onSort(sortKey)}
                  className={`inline-flex items-center gap-1 text-micro uppercase tracking-eyebrow transition-colors ${
                    isActive ? 'text-ink-600' : 'text-ink-400 hover:text-ink-600'
                  }`}
                >
                  <span>{col.label}</span>
                  {isActive && (
                    <span aria-hidden className="inline-flex">
                      <ChevronDownIcon
                        size={12}
                        className={`transition-transform ${
                          direction === 'asc' ? 'rotate-180' : ''
                        }`}
                      />
                    </span>
                  )}
                </button>
              ) : (
                <span className="text-micro uppercase tracking-eyebrow text-ink-400">
                  {col.label}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Filas — clickeables (abren el visor); accesibles por teclado. */}
      {items.map((item) => (
        <div
          key={item.id}
          role="row"
          tabIndex={0}
          aria-label={`Abrir ${item.title}`}
          onClick={() => onOpen(item)}
          onKeyDown={(e) => handleRowKeyDown(e, item)}
          className={`group flex items-center gap-3 h-14 px-2 border-b border-ink-100/40 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-300 ${
            selectedIds.has(item.id)
              ? 'bg-[color:var(--accent-sage-soft)]'
              : 'hover:bg-ink-50/60'
          }`}
        >
          {/* Círculo de selección — al inicio de la fila. No abre el visor. */}
          <div role="cell" className="shrink-0">
            <SelectionCircle
              selected={selectedIds.has(item.id)}
              anySelected={anySelected}
              label={`Seleccionar ${item.title}`}
              onToggle={() => onToggleSelect(item)}
            />
          </div>
          <div role="cell" className="flex items-center gap-3 flex-1 min-w-0">
            {/* Miniatura real para imágenes con URL de servir; para el resto
                (o si la imagen falla) cae al glifo de tipo internamente. */}
            <Thumbnail item={item} size="small" />
            {item.pinned && (
              // Indicador discreto de archivo fijado (acento salvia).
              <span
                aria-label="Fijado"
                title="Fijado"
                className="shrink-0 inline-flex"
                style={{ color: 'var(--accent-sage)' }}
              >
                <PinIcon size={13} className="fill-current" />
              </span>
            )}
            <span className="font-medium text-ink-700 truncate">{item.title}</span>
            {/* Etiquetas clickeables — ocultas en pantallas chicas para no
                competir con el nombre. */}
            <TagChips
              tags={item.tags}
              onTagClick={onTagClick}
              className="hidden lg:flex shrink-0"
            />
          </div>
          <div
            role="cell"
            className="w-20 text-right text-caption text-ink-400 uppercase tabular-nums shrink-0 hidden md:block truncate"
          >
            {fileExtensionLabel(item)}
          </div>
          <div
            role="cell"
            className="w-16 text-right text-caption text-ink-400 tabular-nums shrink-0 hidden sm:block"
          >
            {formatShortDate(item.createdAt)}
          </div>
          <div
            role="cell"
            className="w-16 text-right text-caption text-ink-400 tabular-nums shrink-0"
          >
            {formatShortDate(item.updatedAt)}
          </div>
          <div
            role="cell"
            className="w-20 text-right text-caption text-ink-400 tabular-nums shrink-0 hidden md:block"
          >
            {formatByteSize(item.byteSize)}
          </div>
          {/* Acciones — quietas. En táctil (sin hover) siempre visibles; con
              puntero aparecen al hover/focus de la fila. */}
          <div
            role="cell"
            className="shrink-0 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 motion-reduce:transition-none"
          >
            <BibliotecaItemActions item={item} trash={trash} onRename={onRename} />
          </div>
        </div>
      ))}
    </div>
  )
}
