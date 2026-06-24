import type { KeyboardEvent } from 'react'
import type { LibraryItem } from '../../types/biblioteca'
import { formatCardMeta } from './helpers'
import { Thumbnail } from './Thumbnail'
import { BibliotecaItemActions } from './BibliotecaItemActions'
import { SelectionCircle } from './SelectionCircle'
import { TagChips } from './TagChips'
import { PinIcon } from '../Icons'

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
  selected = false,
  anySelected = false,
  onToggleSelect,
  onRename,
  onOpen,
  onTagClick,
}: {
  item: LibraryItem
  trash?: boolean
  /** ¿Este item está seleccionado? (multi-select PR-B). */
  selected?: boolean
  /** ¿Hay alguna selección activa? Mantiene el círculo visible. */
  anySelected?: boolean
  /** Toggle de selección del item. */
  onToggleSelect: (item: LibraryItem) => void
  onRename: (item: LibraryItem) => void
  onOpen: (item: LibraryItem) => void
  /** Filtra por una etiqueta al clickearla (PR-C). Opcional. */
  onTagClick?: (tag: string) => void
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Enter/Espacio abren el visor; Espacio además evita el scroll de página.
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(item)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Abrir ${item.title}`}
      onClick={() => onOpen(item)}
      onKeyDown={handleKeyDown}
      className={`card-paper-hover group relative flex flex-col gap-2.5 p-3 h-full cursor-pointer focus-ring ${
        selected ? 'ring-2 ring-[color:var(--accent-sage)]' : ''
      }`}
    >
      {/* Círculo de selección — arriba a la izquierda. Visible al hover/focus o
          cuando hay selección activa; no abre el visor (frena propagación). */}
      <div className="absolute top-2.5 left-2.5 z-10">
        <SelectionCircle
          selected={selected}
          anySelected={anySelected}
          label={`Seleccionar ${item.title}`}
          onToggle={() => onToggleSelect(item)}
        />
      </div>

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

      {/* Nombre — 2 líneas con elipsis. `pl-7` deja aire para el círculo de
          selección y `pr-8` para las acciones. */}
      <h3
        className="text-body font-medium text-ink-700 leading-snug line-clamp-2 pl-7 pr-8"
        title={item.title}
      >
        {item.title}
      </h3>

      {/* Zona de media — la miniatura (o el glifo) llena el alto disponible. */}
      <div className="flex-1 min-h-28 flex items-stretch">
        <Thumbnail item={item} size="large" />
      </div>

      {/* Metadata — tipo + tamaño, con el indicador de fijado a la derecha. */}
      <p className="flex items-center gap-1.5 text-caption text-ink-400 tabular-nums">
        {item.pinned && (
          // Indicador discreto de archivo fijado (acento salvia).
          <span
            aria-label="Fijado"
            title="Fijado"
            className="shrink-0 inline-flex"
            style={{ color: 'var(--accent-sage)' }}
          >
            <PinIcon size={12} className="fill-current" />
          </span>
        )}
        <span className="min-w-0 truncate">
          {formatCardMeta(item.fileType, item.byteSize)}
        </span>
      </p>

      {/* Etiquetas clickeables (filtran la lista). */}
      <TagChips tags={item.tags} onTagClick={onTagClick} />
    </div>
  )
}
