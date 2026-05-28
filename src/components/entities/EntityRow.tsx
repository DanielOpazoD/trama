import { memo } from 'react'
import { ENTITY_TYPES, type Entity } from '../../types'
import { ChevronRightIcon, SparkleIcon, TrashIcon } from '../Icons'
import { typeAccent } from '../graph/GraphNode'

/**
 * Fila clickable en EntitiesView. Muestra nombre + año + chip de tipo
 * + meta (citas / relaciones count). Al expandir muestra ID corto +
 * link a Spotify si aplica + atajo al panel completo.
 *
 * El viewTransitionName matchea con EntityHeader del panel detail —
 * al abrir el panel, el browser anima del card al header (view
 * transitions API). Eso le da continuidad visual sin frameworks
 * de animation extra.
 *
 * La hover toolbar (abrir + eliminar) sigue el patrón .hover-actions:
 * visible solo on hover en desktop, siempre visible en touch.
 */
function EntityRowInternal({
  entity,
  quoteCount,
  relCount,
  expanded,
  onToggleExpand,
  onSelectEntity,
  onDelete,
}: {
  entity: Entity
  quoteCount: number
  relCount: number
  expanded: boolean
  onToggleExpand: () => void
  onSelectEntity?: (id: string) => void
  onDelete: () => void
}) {
  return (
    <div
      style={{ viewTransitionName: `entity-card-${entity.id}` } as React.CSSProperties}
      className="group relative"
    >
      <button
        type="button"
        onClick={onToggleExpand}
        style={{ borderLeftColor: typeAccent(entity.type) }}
        className={`card-paper-hover w-full text-left p-3 pl-4 border-l-[3px] hover:shadow-ink-900/5 active:scale-[0.995] ${
          expanded ? 'ring-1 ring-ink-100' : ''
        }`}
        aria-label={`Ver ${entity.name}, ${quoteCount} ${
          quoteCount === 1 ? 'cita' : 'citas'
        }`}
        aria-expanded={expanded}
      >
        <div className="flex justify-between items-baseline gap-4">
          <div className="min-w-0">
            <span className="text-ink-700">{entity.name}</span>
            {entity.year !== undefined && (
              <span className="ml-2 text-ink-300 text-sm">({entity.year})</span>
            )}
            <span
              className="ml-3 text-micro uppercase tracking-eyebrow align-middle"
              style={{ color: typeAccent(entity.type) }}
            >
              {ENTITY_TYPES.find((t) => t.value === entity.type)?.label}
            </span>
            {entity.origin.kind === 'ai' && (
              <span
                className="ml-1.5 inline-flex items-center text-sky-700/70 align-middle"
                title="añadido por IA"
              >
                <SparkleIcon size={10} />
              </span>
            )}
          </div>
          <ChevronRightIcon
            size={12}
            className={`text-ink-200 group-hover:text-ink-400 transition-all shrink-0 ${
              expanded ? 'rotate-90 text-ink-500' : ''
            }`}
          />
        </div>
        {entity.description && (
          <p
            className={`mt-1 text-ink-500 text-sm leading-relaxed ${
              expanded ? '' : 'line-clamp-1'
            }`}
          >
            {entity.description}
          </p>
        )}
        {(quoteCount > 0 || relCount > 0) && (
          <div className="mt-1.5 flex gap-3 text-micro uppercase tracking-eyebrow text-ink-300">
            {quoteCount > 0 && (
              <span>
                {quoteCount} {quoteCount === 1 ? 'cita' : 'citas'}
              </span>
            )}
            {relCount > 0 && (
              <span>
                {relCount} {relCount === 1 ? 'relación' : 'relaciones'}
              </span>
            )}
          </div>
        )}

        {expanded && (
          <div className="mt-3 pt-3 border-t border-ink-100/60 space-y-2 animate-fade-up">
            <div className="flex items-baseline gap-3 section-eyebrow">
              <span className="font-mono normal-case tracking-normal text-ink-300">
                {entity.id.slice(0, 8)}
              </span>
              {entity.spotifyUrl && (
                <a
                  href={entity.spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-emerald-700 hover:text-emerald-900 transition-colors"
                >
                  ↗ Spotify
                </a>
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectEntity?.(entity.id)
                }}
                className="ml-auto text-ink-400 hover:text-ink-700 transition-colors cursor-pointer"
              >
                abrir panel →
              </span>
            </div>
          </div>
        )}
      </button>
      <div className="hover-actions">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSelectEntity?.(entity.id)
          }}
          aria-label={`Abrir ${entity.name}`}
          title="Abrir panel"
        >
          <ChevronRightIcon size={12} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="hover-action-destructive"
          aria-label={`Eliminar ${entity.name}`}
          title="Eliminar"
        >
          <TrashIcon size={12} />
        </button>
      </div>
    </div>
  )
}

/**
 * N5: memoizamos para que el scroll de una lista de 100+ entidades no
 * re-renderice cada row cuando cambia el state global (sidebar
 * collapse, theme toggle, etc.). Comparamos referencia de entity
 * (TanStack Query la mantiene estable) + counts + flag expanded.
 *
 * Las callbacks (onToggleExpand, onSelectEntity, onDelete) las
 * ignoramos: el padre las re-crea cada render pero su semántica es
 * estable (depende del `entity.id` solamente).
 */
export const EntityRow = memo(EntityRowInternal, (prev, next) => {
  return (
    prev.entity === next.entity &&
    prev.quoteCount === next.quoteCount &&
    prev.relCount === next.relCount &&
    prev.expanded === next.expanded
  )
})
