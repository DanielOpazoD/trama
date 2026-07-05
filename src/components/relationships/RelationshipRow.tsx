import { memo } from 'react'
import { RELATIONSHIP_TYPES, type Entity, type Relationship } from '../../types'
import { SparkleIcon, TrashIcon } from '../Icons'
import { IconButton } from '../IconButton'

/**
 * Fila de una relación en RelationshipsView. Muestra "from → type → to"
 * con buttons en from/to que despachan al panel de detalle de cada
 * entidad. Toolbar de borrado en hover-right.
 *
 * La vista pasa `from`/`to` como undefined a propósito (usa fromName/toName
 * para no disparar el query wholesale de entidades), así que la fila no puede
 * conocer el TIPO de cada extremo — de ahí que pinte nombres, no sellos.
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
  const linkClass =
    'truncate border-b border-transparent text-ink-700 transition-colors hover:border-ink-300 hover:text-ink-800'
  return (
    <div className="group card-paper-hover p-3 hover:shadow-ink-900/5">
      <div className="flex items-center justify-between gap-3">
        {/* La relación como «línea del grafo»: sujeto · tipo (conector) ·
            objeto. flex-wrap para que no desborde en pantallas angostas. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1 leading-relaxed text-ink-600">
          {from || rel.fromName ? (
            <button
              onClick={() => onSelectEntity?.(from?.id ?? rel.fromId)}
              className={linkClass}
            >
              {from?.name ?? rel.fromName}
            </button>
          ) : (
            <span className="text-ink-700">—</span>
          )}
          <span className="shrink-0 text-micro uppercase tracking-eyebrow text-ink-300">
            {typeLabel}
          </span>
          {to || rel.toName ? (
            <button
              onClick={() => onSelectEntity?.(to?.id ?? rel.toId)}
              className={linkClass}
            >
              {to?.name ?? rel.toName}
            </button>
          ) : (
            <span className="text-ink-700">—</span>
          )}
          {rel.origin.kind === 'ai' && (
            <span
              className="inline-flex items-center text-[color:var(--accent-primary)]"
              title="propuesta por IA"
            >
              <SparkleIcon size={10} />
            </span>
          )}
        </div>
        <IconButton
          onClick={onDelete}
          className="shrink-0 rounded p-1.5 text-ink-400 opacity-0 transition-opacity hover:bg-ink-100 hover:text-[color:var(--accent-clay)] group-hover:opacity-100"
          label="Eliminar"
          title="Eliminar"
        >
          <TrashIcon size={12} />
        </IconButton>
      </div>
      {rel.notes && (
        <p className="mt-1.5 text-body leading-relaxed text-ink-400">{rel.notes}</p>
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
