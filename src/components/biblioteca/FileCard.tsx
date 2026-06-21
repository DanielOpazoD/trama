import type { LibraryItem } from '../../types/biblioteca'
import { formatCardMeta } from './helpers'
import { Thumbnail } from './Thumbnail'

/**
 * Card de un archivo en la vista cuadrícula. Composición editorial sobre papel
 * (`card-paper-hover`: borde suave, micro-tilt + sombra cálida al hover):
 *
 *   - Nombre arriba a la izquierda, 2 líneas máximo con elipsis.
 *   - Zona de media: miniatura grande (imágenes) o glifo de tipo centrado.
 *   - Metadata abajo a la izquierda ("PDF · 164 KB").
 *   - Círculo de selección arriba a la derecha — VISUAL por ahora (aparece al
 *     hover); la selección real (lote, acciones) llega en PR4.
 *
 * Sin botones de acción (renombrar / descargar / borrar son PR4). Presentacional.
 */
export function FileCard({ item }: { item: LibraryItem }) {
  return (
    <div className="card-paper-hover group relative flex flex-col gap-2.5 p-3 h-full">
      {/* Círculo de selección (solo visual; aparece al hover de la card). */}
      <span
        aria-hidden
        className="absolute top-2.5 right-2.5 size-5 rounded-full border border-ink-200 bg-paper-50/80 opacity-0 transition-opacity group-hover:opacity-100"
      />

      {/* Nombre — 2 líneas con elipsis. `pr-6` deja aire para el círculo. */}
      <h3
        className="text-sm font-medium text-ink-700 leading-snug line-clamp-2 pr-6"
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
