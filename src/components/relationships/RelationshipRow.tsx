import { memo } from 'react'
import { RELATIONSHIP_TYPES, type Entity, type Relationship } from '../../types'
import { SparkleIcon, TrashIcon } from '../Icons'

/**
 * Fila de una relación en RelationshipsView. Muestra "from → type → to"
 * con buttons en from/to que despachan al panel de detalle de cada
 * entidad. Toolbar de borrado en hover-right.
 *
 * El label del tipo viene de RELATIONSHIP_TYPES; si la fila tiene un
 * type nuevo que el cliente todavía no conoce (tabla `relationship_types`
 * en DB extendida), usamos un fallback defensivo: reemplazamos `_` por
 * espacios. Sin esto se ve "ASOCIADO_CON" con guión bajo y se siente
 * DB-leaky.
 */
function RelationshipRowInternal({
  rel,
  from,
  to,
  onSelectEntity,
  onDelete,
}: {
  rel: Relationship
  from: Entity | undefined
  to: Entity | undefined
  onSelectEntity?: (id: string) => void
  onDelete: () => void
}) {
  const typeLabel =
    RELATIONSHIP_TYPES.find((t) => t.value === rel.type)?.label ??
    rel.type.replace(/_/g, ' ')
  return (
    <div className="group card-paper-hover p-3 hover:shadow-ink-900/5">
      <div className="flex justify-between items-baseline gap-4">
        <div className="text-ink-600 leading-relaxed">
          {from ? (
            <button
              onClick={() => onSelectEntity?.(from.id)}
              className="text-ink-700 hover:text-ink-900 transition-colors border-b border-transparent hover:border-ink-300"
            >
              {from.name}
            </button>
          ) : rel.fromName ? (
            <button
              onClick={() => onSelectEntity?.(rel.fromId)}
              className="text-ink-700 hover:text-ink-900 transition-colors border-b border-transparent hover:border-ink-300"
            >
              {rel.fromName}
            </button>
          ) : (
            <span className="text-ink-700">—</span>
          )}
          <span className="mx-2 text-micro uppercase tracking-eyebrow text-ink-300">
            {typeLabel}
          </span>
          {to ? (
            <button
              onClick={() => onSelectEntity?.(to.id)}
              className="text-ink-700 hover:text-ink-900 transition-colors border-b border-transparent hover:border-ink-300"
            >
              {to.name}
            </button>
          ) : rel.toName ? (
            <button
              onClick={() => onSelectEntity?.(rel.toId)}
              className="text-ink-700 hover:text-ink-900 transition-colors border-b border-transparent hover:border-ink-300"
            >
              {rel.toName}
            </button>
          ) : (
            <span className="text-ink-700">—</span>
          )}
          {rel.origin.kind === 'ai' && (
            <span
              className="ml-1.5 inline-flex items-center text-[color:var(--accent-primary)] align-middle"
              title="propuesta por IA"
            >
              <SparkleIcon size={10} />
            </span>
          )}
        </div>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-ink-400 hover:text-[color:var(--accent-clay)] hover:bg-ink-100 rounded"
          aria-label="Eliminar"
          title="Eliminar"
        >
          <TrashIcon size={12} />
        </button>
      </div>
      {rel.notes && (
        <p className="mt-1 text-sm text-ink-400 leading-relaxed">{rel.notes}</p>
      )}
    </div>
  )
}

/**
 * Q3: memoizamos para que scroll de RelationshipsView con N filas no
 * re-renderice cada row al cambiar state global. TanStack Query mantiene
 * referencias estables; from/to cambian solo si su row cambia.
 * Ignoramos las callbacks (onSelectEntity/onDelete) — el padre las
 * re-crea inline pero la semántica es estable per-row.
 */
export const RelationshipRow = memo(RelationshipRowInternal, (prev, next) => {
  return prev.rel === next.rel && prev.from === next.from && prev.to === next.to
})
