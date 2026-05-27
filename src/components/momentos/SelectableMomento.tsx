import type { Entity, Momento } from '../../types'
import { MomentoEntry } from './MomentoEntry'

/**
 * Wrapper de MomentoEntry para el modo selección (sprint EE).
 *
 *   - Modo normal (selectionMode=false): render idéntico al original,
 *     hand-off directo a MomentoEntry.
 *   - Modo selección (selectionMode=true): agrega un overlay
 *     click-through que toggle el id + indicador visual (ring + checkbox
 *     arriba-izquierda). Los handlers internos de MomentoEntry (delete,
 *     lightbox, hover toolbar) quedan inertes porque envolvemos en un
 *     div con `pointer-events-none` y el outer div captura el click.
 *
 * A11y: usa `role="checkbox"` con teclas Space/Enter para toggle —
 * convención WAI-ARIA estándar.
 */
export function SelectableMomento({
  momento,
  entitiesById,
  selectionMode,
  selected,
  onToggleSelect,
  onDelete,
}: {
  momento: Momento
  entitiesById: Map<string, Entity>
  selectionMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onDelete: () => void
}) {
  if (!selectionMode) {
    return (
      <MomentoEntry
        momento={momento}
        entitiesById={entitiesById}
        onDelete={onDelete}
      />
    )
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      onToggleSelect()
    }
  }

  return (
    <div
      className={`relative rounded-xl transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        selected
          ? 'ring-2 ring-offset-2'
          : 'ring-1 ring-transparent hover:ring-ink-100/80'
      }`}
      style={{
        ...(selected
          ? { boxShadow: '0 0 0 2px var(--accent-gold), 0 0 0 4px rgb(var(--paper-50))' }
          : {}),
      }}
      onClick={onToggleSelect}
      onKeyDown={handleKeyDown}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      aria-label={`Seleccionar momento del ${momento.capturedAt.slice(0, 10)}`}
    >
      <div
        className="absolute top-2 left-2 z-10 size-5 rounded-md border-2 flex items-center justify-center pointer-events-none"
        style={{
          backgroundColor: selected ? 'var(--accent-gold)' : 'rgb(var(--paper-50))',
          borderColor: selected ? 'var(--accent-gold)' : 'rgb(var(--ink-300) / 0.6)',
        }}
        aria-hidden
      >
        {selected && (
          <span className="text-paper-50 text-xs leading-none font-bold">✓</span>
        )}
      </div>
      <div className="pointer-events-none opacity-90">
        <MomentoEntry
          momento={momento}
          entitiesById={entitiesById}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}
