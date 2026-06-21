import type { LibraryItem } from '../../types/biblioteca'
import { formatCardMeta } from './helpers'
import { Thumbnail } from './Thumbnail'
import { BibliotecaItemActions } from './BibliotecaItemActions'

/**
 * Card de un archivo en la vista cuadrícula. Composición editorial sobre papel
 * (`card-paper-hover`: borde suave, micro-tilt + sombra cálida al hover):
 *
 *   - Nombre arriba a la izquierda, 2 líneas máximo con elipsis.
 *   - Zona de media: miniatura grande (imágenes) o glifo de tipo centrado.
 *   - Metadata abajo a la izquierda ("PDF · 164 KB").
 *   - Acciones (PR4): tira vertical de íconos en el borde derecho, revelada al
 *     hover/focus de la card (renombrar / descargar / eliminar; o Restaurar en
 *     la papelera). Mantenida alcanzable por teclado vía `focus-within`.
 *
 * Presentacional salvo las acciones (que llevan sus propios hooks).
 */
export function FileCard({
  item,
  trash = false,
  onRename,
}: {
  item: LibraryItem
  trash?: boolean
  onRename: (item: LibraryItem) => void
}) {
  return (
    <div className="card-paper-hover group relative flex flex-col gap-2.5 p-3 h-full">
      {/* Acciones — tira vertical en el borde derecho. En táctil siempre
          visible; con puntero aparece al hover/focus de la card. */}
      <div className="absolute top-2.5 right-2 z-10 rounded-lg bg-paper-50/85 backdrop-blur-sm opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 motion-reduce:transition-none">
        <BibliotecaItemActions
          item={item}
          trash={trash}
          orientation="vertical"
          onRename={onRename}
        />
      </div>

      {/* Nombre — 2 líneas con elipsis. `pr-8` deja aire para las acciones. */}
      <h3
        className="text-sm font-medium text-ink-700 leading-snug line-clamp-2 pr-8"
        title={item.title}
      >
        {item.title}
      </h3>

      {/* Zona de media — la miniatura (o el glifo) llena el alto disponible. */}
      <div className="flex-1 min-h-28 flex items-stretch">
        <Thumbnail item={item} size="large" />
      </div>

      {/* Metadata — tipo + tamaño. */}
      <p className="text-caption text-ink-400 tabular-nums truncate">
        {formatCardMeta(item.fileType, item.byteSize)}
      </p>
    </div>
  )
}
