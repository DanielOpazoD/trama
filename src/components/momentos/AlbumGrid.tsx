import { useMemo } from 'react'
import type { Entity, Momento } from '../../types'
import { EmptyMessage } from '../EmptyMessage'
import { TrashIcon } from '../Icons'
import { formatMonthLabel, groupByMonth } from './helpers'

/**
 * Vista alternativa de Momentos: grid masonry-like (en realidad
 * aspect-square con object-cover) agrupado por mes-año. Solo se usa
 * cuando filtras por kind=foto y eliges "Álbum" en el toggle.
 *
 * Filtra implícitamente cualquier no-foto que se cuele en items
 * (defensa contra props mal pasados).
 */
export function AlbumGrid({
  items,
  entitiesById,
  onDelete,
}: {
  items: Momento[]
  entitiesById: Map<string, Entity>
  onDelete: (id: string) => void
}) {
  const groups = useMemo(
    () => groupByMonth(items.filter((m) => m.kind === 'foto')),
    [items],
  )

  if (groups.length === 0) {
    return (
      <EmptyMessage
        title="No hay fotos todavía"
        body={<>Sube una imagen desde el composer de arriba.</>}
      />
    )
  }

  return (
    <div className="space-y-10">
      {groups.map(({ monthKey, entries }) => (
        <section key={monthKey} className="animate-fade-up">
          <div className="mb-3 flex items-baseline gap-3">
            <h3
              className="section-eyebrow-serif"
              style={{ color: 'var(--accent-gold)' }}
            >
              {formatMonthLabel(monthKey)}
            </h3>
            <span className="flex-1 h-px bg-ink-100/40" />
            <span className="text-caption text-ink-300 tabular-nums">
              {entries.length} {entries.length === 1 ? 'foto' : 'fotos'}
            </span>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {entries.map((p) => (
              <AlbumTile
                key={p.id}
                momento={p}
                entitiesById={entitiesById}
                onDelete={() => onDelete(p.id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function AlbumTile({
  momento,
  entitiesById,
  onDelete,
}: {
  momento: Momento
  entitiesById: Map<string, Entity>
  onDelete: () => void
}) {
  const { storageKey, caption } = momento.payload
  const linkedEntities = momento.entityIds
    .map((id) => entitiesById.get(id))
    .filter((e): e is Entity => Boolean(e))
  if (!storageKey) return null
  const d = new Date(momento.capturedAt)
  const dateLabel = !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
    : ''

  return (
    <li className="group relative">
      <div className="aspect-square overflow-hidden rounded-md border border-ink-100/60 bg-paper-100/40">
        <img
          src={`/api/momentos/file/${encodeURIComponent(storageKey)}`}
          alt={caption ?? 'momento'}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-ink-900/70 to-transparent rounded-b-md opacity-0 group-hover:opacity-100 transition-opacity">
        {caption && (
          <p className="text-paper-50 text-xs font-serif italic line-clamp-2">
            {caption}
          </p>
        )}
        <p className="text-paper-200/80 text-micro tracking-wider mt-0.5">
          {dateLabel}
        </p>
      </div>
      {linkedEntities.length > 0 && (
        <p className="mt-1 text-caption text-ink-400 truncate">
          {linkedEntities.map((e) => e.name).join(' · ')}
        </p>
      )}
      <button
        onClick={onDelete}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-paper-50/80 backdrop-blur-sm rounded text-ink-500 hover:text-red-700"
        aria-label="Eliminar foto"
        title="Eliminar"
      >
        <TrashIcon size={12} />
      </button>
    </li>
  )
}
