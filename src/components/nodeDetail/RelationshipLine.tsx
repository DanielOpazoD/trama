import { RELATIONSHIP_TYPES, type Entity, type Relationship } from '../../types'
import { SparkleIcon } from '../Icons'
import { CloseButton } from '../CloseButton'
import { EntitySigil } from '../EntitySigil'

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
    <li className="group flex items-center justify-between gap-2 text-caption">
      {/* El sello de la entidad conectada le da cara a la conexión — aquí sí
          está resuelta con su tipo (a diferencia de la vista Vínculos). */}
      <span className="flex min-w-0 items-center gap-2 leading-relaxed">
        {otherEntity && (
          <EntitySigil name={otherEntity.name} type={otherEntity.type} size="sm" />
        )}
        <span className="min-w-0">
          <span className="text-micro uppercase tracking-eyebrow text-ink-400 mr-2">
            {label ?? rel.type}
          </span>
          <span className="text-ink-600">{otherEntity?.name ?? '—'}</span>
          {rel.origin.kind === 'ai' && (
            <span
              className="ml-1.5 inline-flex items-center align-middle text-[color:var(--accent-primary)]"
              title="propuesta por IA"
            >
              <SparkleIcon size={10} />
            </span>
          )}
        </span>
      </span>
      <CloseButton
        onClick={onDelete}
        label="Eliminar relación"
        size={12}
        title="Eliminar relación"
        className="shrink-0 text-ink-300 opacity-0 transition-opacity hover:text-[color:var(--accent-clay)] focus-visible:opacity-100 group-hover:opacity-100"
      />
    </li>
  )
}
