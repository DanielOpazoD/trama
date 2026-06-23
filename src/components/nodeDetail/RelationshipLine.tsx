import { RELATIONSHIP_TYPES, type Entity, type Relationship } from '../../types'
import { SparkleIcon } from '../Icons'
import { CloseButton } from '../CloseButton'

/**
 * Una fila de "conexiones" en el panel de detalle.
 *
 * Render puro — recibe la relación, la entidad del otro lado y un callback
 * de borrado. No accede a hooks de query; el padre tiene que pasarle
 * todo lo que necesita.
 */
export function RelationshipLine({
  rel,
  direction,
  otherEntity,
  onDelete,
}: {
  rel: Relationship
  direction: 'in' | 'out'
  otherEntity: Entity | undefined
  onDelete: () => void
}) {
  const typeDef = RELATIONSHIP_TYPES.find((t) => t.value === rel.type)
  const label = direction === 'out' ? typeDef?.label : typeDef?.reverseLabel
  return (
    <li className="group flex items-baseline justify-between gap-2 text-xs">
      <span className="leading-relaxed">
        <span className="text-micro uppercase tracking-eyebrow text-ink-400 mr-2">
          {label ?? rel.type}
        </span>
        <span className="text-ink-600">{otherEntity?.name ?? '—'}</span>
        {rel.origin.kind === 'ai' && (
          <span
            className="ml-1.5 inline-flex items-center text-[color:var(--accent-primary)] align-middle"
            title="propuesta por IA"
          >
            <SparkleIcon size={10} />
          </span>
        )}
      </span>
      <CloseButton
        onClick={onDelete}
        label="Eliminar relación"
        size={12}
        title="Eliminar relación"
        className="shrink-0 opacity-0 group-hover:opacity-100 text-ink-300 hover:text-[color:var(--accent-clay)] transition-opacity"
      />
    </li>
  )
}
