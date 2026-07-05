import { useMemo } from 'react'
import type { Entity, Relationship } from '../../types'

/**
 * Hilos sueltos — entidades que todavía no se cruzan con nada (grado 0 en
 * el grafo). En vez de esconderlas como deuda, la portada las ofrece como
 * invitación editorial: un hilo suelto se ata abriendo su panel y tejiendo
 * la primera relación. Borde discontinuo a propósito: aún no cosido.
 */

const MAX_ITEMS = 5

export function findHilosSueltos(
  entities: Entity[],
  relationships: Relationship[],
  limit: number = MAX_ITEMS,
): Entity[] {
  const connected = new Set<string>()
  for (const r of relationships) {
    connected.add(r.fromId)
    connected.add(r.toId)
  }
  return entities
    .filter((e) => !connected.has(e.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

export function HilosSueltos({
  entities,
  relationships,
  onSelectEntity,
}: {
  entities: Entity[]
  relationships: Relationship[]
  onSelectEntity: (id: string) => void
}) {
  const sueltos = useMemo(
    () => findHilosSueltos(entities, relationships),
    [entities, relationships],
  )
  if (sueltos.length === 0) return null

  return (
    <section aria-label="Hilos sueltos">
      <h3 className="section-eyebrow mb-1.5">hilos sueltos</h3>
      <p className="text-caption text-ink-400 leading-relaxed mb-3">
        Entidades que aún no se cruzan con nada. Abre una y teje su primera relación.
      </p>
      <ul className="flex flex-wrap gap-2">
        {sueltos.map((e) => (
          <li key={e.id}>
            <button
              onClick={() => onSelectEntity(e.id)}
              className="inline-flex items-baseline gap-1.5 rounded-full border border-dashed border-ink-200 px-3 py-1 text-caption text-ink-600 transition-colors hover:border-solid hover:border-ink-300 hover:text-ink-800"
            >
              <span className="font-serif">{e.name}</span>
              <span className="text-micro uppercase tracking-wider text-ink-300">
                {e.type}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
