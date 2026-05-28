import {
  useDeleteRelationship,
  useEntitiesQuery,
  useRelationshipsQuery,
} from '../../state'
import type { Entity } from '../../types'
import { RelationshipLine } from './RelationshipLine'

/**
 * Lista de relaciones de la entidad — outgoing primero, incoming después.
 *
 * No se renderiza si la entidad no tiene conexiones (al padre le da
 * el placeholder). Cada línea es una RelationshipLine con su propio
 * delete callback que usa la mutation cacheada.
 */
export function ConnectionsList({ entity }: { entity: Entity }) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const deleteRelationship = useDeleteRelationship()

  const outgoing = relationships.filter((r) => r.fromId === entity.id)
  const incoming = relationships.filter((r) => r.toId === entity.id)

  if (outgoing.length === 0 && incoming.length === 0) return null

  return (
    <section>
      <h3 className="section-eyebrow-serif mb-3">Conexiones</h3>
      <ul className="space-y-1.5">
        {outgoing.map((rel) => (
          <RelationshipLine
            key={rel.id}
            rel={rel}
            direction="out"
            otherEntity={entities.find((e) => e.id === rel.toId)}
            onDelete={() => deleteRelationship.mutate(rel.id)}
          />
        ))}
        {incoming.map((rel) => (
          <RelationshipLine
            key={rel.id}
            rel={rel}
            direction="in"
            otherEntity={entities.find((e) => e.id === rel.fromId)}
            onDelete={() => deleteRelationship.mutate(rel.id)}
          />
        ))}
      </ul>
    </section>
  )
}
