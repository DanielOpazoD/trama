import type { MouseEvent } from 'react'

/**
 * Chips de etiquetas clickeables para las cards / filas de la Biblioteca
 * (PR-C). Al hacer clic en una etiqueta se filtra la lista por ella
 * (`onTagClick`), sin abrir el visor (frena la propagación). Si no se pasa
 * `onTagClick`, los chips quedan informativos (no clickeables).
 *
 * Compartido por la cuadrícula (FileCard) y la lista (BibliotecaListView) para
 * que el lenguaje visual y el comportamiento de filtrado sean idénticos.
 */
export function TagChips({
  tags,
  onTagClick,
  className,
}: {
  tags: string[]
  onTagClick?: (tag: string) => void
  className?: string
}) {
  if (tags.length === 0) return null

  function handleClick(event: MouseEvent, tag: string) {
    if (!onTagClick) return
    event.preventDefault()
    event.stopPropagation()
    onTagClick(tag)
  }

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ''}`}>
      {tags.map((tag) =>
        onTagClick ? (
          <button
            key={tag}
            type="button"
            onClick={(e) => handleClick(e, tag)}
            aria-label={`Filtrar por etiqueta ${tag}`}
            className="rounded-full bg-ink-100/70 px-2 py-0.5 text-micro text-ink-500 transition-colors hover:bg-[color:var(--accent-sage-soft)] hover:text-ink-700"
          >
            {tag}
          </button>
        ) : (
          <span
            key={tag}
            className="rounded-full bg-ink-100/70 px-2 py-0.5 text-micro text-ink-500"
          >
            {tag}
          </span>
        ),
      )}
    </div>
  )
}
