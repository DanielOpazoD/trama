import { memo } from 'react'
import { ENTITY_TYPES, type Entity } from '../../types'
import { ChevronRightIcon, SparkleIcon } from '../Icons'
import { typeAccent } from '../graph/GraphNode'
import { WhatsAppSourceTag } from '../WhatsAppSourceTag'
import { EntitySigil } from '../EntitySigil'

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
      style={{ viewTransitionName: `entity-card-${entity.id}` } as React.CSSProperties}
      className={`group card-paper-hover flex w-full items-start gap-3 text-left hover:shadow-ink-900/5 active:scale-[0.995] ${
        compact ? 'p-2' : 'p-3'
      }`}
      aria-label={`Abrir ${entity.name}, ${quoteCount} ${
        quoteCount === 1 ? 'cita' : 'citas'
      }`}
    >
      {/* El sello (monograma) es el ancla cromática del tipo: sustituye la
          vieja barra lateral y le da cara única a cada entidad. */}
      <EntitySigil
        name={entity.name}
        type={entity.type}
        size={compact ? 'sm' : 'md'}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-serif text-lead leading-snug text-ink-800">
            {entity.name}
          </span>
          {entity.year !== undefined && (
            <span className="text-caption tabular-nums text-ink-300">
              ({entity.year})
            </span>
          )}
          <span
            className="text-micro uppercase tracking-eyebrow"
            style={{ color: typeAccent(entity.type) }}
          >
            {ENTITY_TYPES.find((t) => t.value === entity.type)?.label}
          </span>
          {entity.origin.kind === 'ai' && (
            <span
              className="inline-flex items-center text-[color:var(--accent-primary)]"
              title="añadido por IA"
            >
              <SparkleIcon size={10} />
            </span>
          )}
          <WhatsAppSourceTag origin={entity.origin} />
        </div>
        {!compact && entity.description && (
          <p className="mt-1 text-body leading-relaxed text-ink-500 line-clamp-1">
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
      </div>
      {/* Chevron estático: señala que la tarjeta abre el panel lateral. */}
      <ChevronRightIcon
        size={12}
        className="mt-1.5 shrink-0 text-ink-200 transition-colors group-hover:text-ink-400"
      />
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
