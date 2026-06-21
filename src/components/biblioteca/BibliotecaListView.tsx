import { ChevronDownIcon } from '../Icons'
import type { LibraryItem } from '../../types/biblioteca'
import { Thumbnail } from './Thumbnail'
import { BibliotecaItemActions } from './BibliotecaItemActions'
import {
  formatByteSize,
  formatShortDate,
  parseOrden,
  type BibliotecaOrden,
  type SortColumn,
} from './helpers'

/**
 * Lista de la Biblioteca con aspecto de tabla minimalista sobre papel
 * (no cards en caja). Encabezados Nombre / Modificado / Tamaño ordenables:
 * cada uno es un botón que alterna asc/desc y muestra un chevron en la
 * columna activa. `aria-sort` comunica el estado a lectores de pantalla.
 *
 * Presentacional: recibe items + orden + el callback de orden. El estado vive
 * en el orquestador (BibliotecaView).
 */

const COLUMNS: ReadonlyArray<{
  key: SortColumn
  label: string
  align: 'left' | 'right'
}> = [
  { key: 'nombre', label: 'Nombre', align: 'left' },
  { key: 'modificado', label: 'Modificado', align: 'right' },
  { key: 'tamano', label: 'Tamaño', align: 'right' },
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
  onRename,
}: {
  items: LibraryItem[]
  orden: BibliotecaOrden
  onSort: (column: SortColumn) => void
  /** Vista papelera: las acciones de fila se reducen a Restaurar. */
  trash?: boolean
  onRename: (item: LibraryItem) => void
}) {
  const { column: activeColumn, direction } = parseOrden(orden)

  return (
    <div role="table" aria-label="Archivos" className="text-sm">
      {/* Encabezado — botones de orden */}
      <div
        role="row"
        className="flex items-center gap-3 h-9 px-2 border-b border-ink-100/70"
      >
        {COLUMNS.map((col) => {
          const isActive = col.key === activeColumn
          // Nombre se estira; Modificado/Tamaño tienen ancho fijo a la derecha.
          // Tamaño se oculta bajo sm para no apretar en móvil.
          const widthClass =
            col.key === 'nombre'
              ? 'flex-1 min-w-0'
              : col.key === 'tamano'
                ? 'w-20 justify-end hidden sm:flex'
                : 'w-16 justify-end'
          return (
            <div
              key={col.key}
              role="columnheader"
              aria-sort={ariaSortFor(col.key, activeColumn, direction)}
              className={widthClass}
            >
              <button
                type="button"
                onClick={() => onSort(col.key)}
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
            </div>
          )
        })}
      </div>

      {/* Filas */}
      {items.map((item) => (
        <div
          key={item.id}
          role="row"
          className="group flex items-center gap-3 h-14 px-2 border-b border-ink-100/40 hover:bg-ink-50/60 transition-colors"
        >
          <div role="cell" className="flex items-center gap-3 flex-1 min-w-0">
            {/* Miniatura real para imágenes con URL de servir; para el resto
                (o si la imagen falla) cae al glifo de tipo internamente. */}
            <Thumbnail item={item} size="small" />
            <span className="font-medium text-ink-700 truncate">{item.title}</span>
          </div>
          <div
            role="cell"
            className="w-16 text-right text-caption text-ink-400 tabular-nums shrink-0"
          >
            {formatShortDate(item.updatedAt)}
          </div>
          <div
            role="cell"
            className="w-20 text-right text-caption text-ink-400 tabular-nums shrink-0 hidden sm:block"
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
