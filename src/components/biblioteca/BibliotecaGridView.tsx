import type { LibraryItem } from '../../types/biblioteca'
import { FileCard } from './FileCard'

/**
 * Vista en cuadrícula de la Biblioteca: una grilla responsiva de cards
 * (1 columna en móvil, 2 en tablet, 3 en escritorio). Presentacional: recibe
 * los items ya cargados; cada card es independiente.
 */
export function BibliotecaGridView({
  items,
  trash = false,
  onRename,
}: {
  items: LibraryItem[]
  trash?: boolean
  onRename: (item: LibraryItem) => void
}) {
  return (
    <div
      role="list"
      aria-label="Archivos"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {items.map((item) => (
        <div role="listitem" key={item.id}>
          <FileCard item={item} trash={trash} onRename={onRename} />
        </div>
      ))}
    </div>
  )
}
