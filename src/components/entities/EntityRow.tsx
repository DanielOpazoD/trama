import { memo } from 'react'
import { ENTITY_TYPES, type Entity } from '../../types'
import { ChevronRightIcon, SparkleIcon } from '../Icons'
import { typeAccent } from '../graph/GraphNode'

/**
 * Fila clickable en EntitiesView. Muestra nombre + año + chip de tipo
 * + meta (citas / relaciones count). Al hacer clic se abre el panel
 * lateral derecho con el detalle completo de la entidad — no hay
 * accordion inline ni acciones flotantes; el panel es el único destino.
 *
 * El viewTransitionName matchea con EntityHeader del panel detail —
 * al abrir el panel, el browser anima del card al header (view
 * transitions API). Eso le da continuidad visual sin frameworks
 * de animation extra.
 */
function EntityRowInternal({
  entity,
  quoteCount,
  relCount,
  compact = false,
  onSelectEntity,
}: {
  entity: Entity
  quoteCount: number
  relCount: number
  /** Modo compacto (densidad): menos padding; sin descripción ni conteos. */
  compact?: boolean
  onSelectEntity?: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectEntity?.(entity.id)}
      style={
        {
          viewTransitionName: `entity-card-${entity.id}`,
          borderLeftColor: typeAccent(entity.type),
        } as React.CSSProperties
      }
      className={`group card-paper-hover w-full text-left border-l-[3px] hover:shadow-ink-900/5 active:scale-[0.995] ${
        compact ? 'p-2 pl-3' : 'p-3 pl-4'
      }`}
      aria-label={`Abrir ${entity.name}, ${quoteCount} ${
        quoteCount === 1 ? 'cita' : 'citas'
      }`}
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
              className="ml-1.5 inline-flex items-center text-[color:var(--accent-primary)] align-middle"
              title="añadido por IA"
            >
              <SparkleIcon size={10} />
            </span>
          )}
        </div>
        {/* Chevron estático: señala que la tarjeta abre el panel lateral. */}
        <ChevronRightIcon
          size={12}
          className="text-ink-200 group-hover:text-ink-400 transition-colors shrink-0"
        />
      </div>
      {!compact && entity.description && (
        <p className="mt-1 text-ink-500 text-sm leading-relaxed line-clamp-1">
          {entity.description}
        </p>
      )}
      {!compact && (quoteCount > 0 || relCount > 0) && (
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
    </button>
  )
}

/**
 * N5: memoizamos para que el scroll de una lista de 100+ entidades no
 * re-renderice cada row cuando cambia el state global (sidebar
 * collapse, theme toggle, etc.). Comparamos referencia de entity
 * (TanStack Query la mantiene estable) + counts.
 *
 * La callback (onSelectEntity) la ignoramos: el padre la re-crea cada
 * render pero su semántica es estable (depende del `entity.id` solamente).
 */
export const EntityRow = memo(EntityRowInternal, (prev, next) => {
  return (
    prev.entity === next.entity &&
    prev.quoteCount === next.quoteCount &&
    prev.relCount === next.relCount &&
    prev.compact === next.compact
  )
})
