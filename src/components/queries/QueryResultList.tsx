import type { QueryHit } from '../../api/query'

/**
 * Render compartido de los hits del motor de queries (entity/quote/momento/
 * note). Lo usan la vista Consultas y el bloque embebible para que un
 * resultado se vea igual donde sea.
 */
const KIND_LABEL: Record<QueryHit['kind'], string> = {
  entity: 'Entidad',
  quote: 'Cita',
  momento: 'Momento',
  note: 'Nota',
}

export function QueryResultList({
  items,
  emptyHint,
}: {
  items: QueryHit[]
  emptyHint?: string
}) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-400 italic">{emptyHint ?? 'Sin resultados.'}</p>
  }
  return (
    <ul className="space-y-1.5">
      {items.map((hit) => (
        <li
          key={`${hit.kind}-${hit.id}`}
          className="flex items-start gap-2.5 rounded-lg border border-ink-100 bg-paper-50 px-3 py-2"
        >
          <span className="mt-0.5 shrink-0 text-micro uppercase tracking-eyebrow text-ink-400">
            {KIND_LABEL[hit.kind]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-ink-800 truncate">
              {hit.title ?? '(sin título)'}
            </span>
            {hit.snippet && (
              <span className="block text-xs text-ink-500 line-clamp-2">
                {hit.snippet}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
