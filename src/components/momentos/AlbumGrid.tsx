import { useMemo, useState } from 'react'
import { useLocalStorageState } from '../../hooks/useLocalStorageState'
import type { Entity, Momento } from '../../types'
import { EmptyMessage } from '../EmptyMessage'
import { PencilIcon, TrashIcon } from '../Icons'
import { AuthenticatedMomentoImage } from './AuthenticatedMedia'
import { formatMonthLabel, getMomentoPhotoItems, groupByMonth } from './helpers'
import { MomentoEditModal } from './MomentoEditModal'
import { MomentoFeedback } from './MomentoFeedback'

/**
 * Vista alternativa de Momentos: grid de fotos en cronología año → mes.
 * El único ajuste visible es el tamaño de tile, guardado como preferencia.
 *
 * Solo se usa cuando filtras por kind=foto y eliges "Álbum" en el
 * toggle global. Filtra implícitamente cualquier no-foto que se cuele
 * (defensa contra props mal pasados).
 */

type TileSize = 'small' | 'medium' | 'large'

const SIZE_STORAGE_KEY = 'trama:album-size'
const TILE_SIZES: readonly TileSize[] = ['small', 'medium', 'large']

const SIZE_LABELS: Record<TileSize, string> = {
  small: 'mini',
  medium: 'medio',
  large: 'grande',
}

const SIZE_GRID_CLASS: Record<TileSize, string> = {
  // ψ-photos-rich: 3 tamaños de tile. Pequeño = miniaturas tipo grilla
  // de Instagram. Mediano = balance lectura/scanning. Grande = una
  // foto se respira más en mobile, dos cómodas en desktop.
  small: 'grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-1.5',
  medium: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3',
  large: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4',
}

export function AlbumGrid({
  items,
  entitiesById,
  onDelete,
}: {
  items: Momento[]
  entitiesById: Map<string, Entity>
  onDelete: (id: string) => void
}) {
  const photoItems = useMemo(() => items.filter((m) => m.kind === 'foto'), [items])

  const [size, setSize] = useLocalStorageState<TileSize>(
    SIZE_STORAGE_KEY,
    'medium',
    (raw): raw is TileSize => TILE_SIZES.includes(raw as TileSize),
  )
  // Cronología fija: año primero, mes secundario. Evita otro control visible
  // en una pantalla que ya tiene filtros de contenido y vista.
  const yearlyGroups = useMemo(() => groupByYearThenMonth(photoItems), [photoItems])

  if (photoItems.length === 0) {
    return (
      <EmptyMessage
        illustration="pair"
        title="No hay fotos todavía"
        body={<>Sube una imagen desde el composer de arriba.</>}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="-mt-2 flex justify-end">
        <SizeMenu value={size} onChange={setSize} />
      </div>

      <div className="space-y-12">
        {yearlyGroups.map(({ year, months }) => (
          <section key={year} className="animate-fade-up">
            <header className="mb-4 flex items-baseline gap-4">
              <h2
                className="font-serif text-3xl text-ink-700 leading-none tracking-tight"
                style={{ color: 'var(--accent-gold)' }}
              >
                {year}
              </h2>
              <span className="flex-1 h-px bg-ink-100/40 mb-1.5" />
              <span className="text-caption text-ink-300 tabular-nums">
                {months.reduce((acc, m) => acc + m.entries.length, 0)}{' '}
                {months.reduce((acc, m) => acc + m.entries.length, 0) === 1
                  ? 'foto'
                  : 'fotos'}
              </span>
            </header>
            <div className="space-y-6">
              {months.map(({ monthKey, entries }) => (
                <div key={monthKey}>
                  <p className="section-eyebrow mb-2">
                    {formatMonthLabel(monthKey).replace(/\s+\d{4}$/, '')}{' '}
                    <span className="text-ink-300 tabular-nums ml-1">
                      · {entries.length}
                    </span>
                  </p>
                  <ul className={SIZE_GRID_CLASS[size]}>
                    {entries.map((p) => (
                      <AlbumTile
                        key={p.id}
                        momento={p}
                        entitiesById={entitiesById}
                        onDelete={() => onDelete(p.id)}
                        size={size}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function SizeMenu({
  value,
  onChange,
}: {
  value: TileSize
  onChange: (v: TileSize) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-ink-100/70 bg-paper-50/80 px-3 py-1.5 text-caption text-ink-500 shadow-sm hover:text-ink-800"
      >
        Tamaño: {SIZE_LABELS[value]}
        <span aria-hidden>⌄</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-20 w-32 rounded-xl border border-ink-100 bg-paper-50 p-1.5 shadow-xl shadow-ink-900/15"
        >
          {TILE_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(size)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-600 hover:bg-ink-100/60 hover:text-ink-800"
            >
              <span className="inline-flex w-3 justify-center text-ink-500">
                {size === value ? '·' : ''}
              </span>
              {SIZE_LABELS[size]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function AlbumTile({
  momento,
  entitiesById,
  onDelete,
  size,
}: {
  momento: Momento
  entitiesById: Map<string, Entity>
  onDelete: () => void
  size: TileSize
}) {
  const { caption } = momento.payload
  const photos = getMomentoPhotoItems(momento.payload)
  const storageKey = photos[0]?.storageKey
  const extraCount = Math.max(photos.length - 1, 0)
  const linkedEntities = momento.entityIds
    .map((id) => entitiesById.get(id))
    .filter((e): e is Entity => Boolean(e))
  const [actionsOpen, setActionsOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  if (!storageKey) return null
  const d = new Date(momento.capturedAt)
  const dateLabel = !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
    : ''

  // ψ-photos-rich: en miniaturas, ocultamos las etiquetas inferiores y
  // mostramos solo el overlay del trash al hover. En medio y grande,
  // mostramos caption + fecha al hover. En grande también las
  // entidades vinculadas debajo.
  const showOverlay = size !== 'small'
  const showLinked = size === 'large'
  const canEdit = momento.accessRole !== 'viewer'
  const canDelete = !momento.shared

  return (
    <li className="group relative">
      <div className="aspect-square overflow-hidden rounded-md border border-ink-100/60 bg-paper-100/40 relative">
        <AuthenticatedMomentoImage
          storageKey={storageKey}
          alt={caption ?? 'momento'}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {extraCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 text-micro tabular-nums bg-ink-900/65 text-paper-50 px-1.5 py-0.5 rounded leading-none"
            aria-hidden
          >
            +{extraCount}
          </span>
        )}
        <div className="absolute left-1.5 bottom-1.5">
          <MomentoFeedback momentoId={momento.id} compact />
        </div>
      </div>
      {showOverlay && (
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
      )}
      {showLinked && linkedEntities.length > 0 && (
        <p className="mt-1 text-caption text-ink-400 truncate">
          {linkedEntities.map((e) => e.name).join(' · ')}
        </p>
      )}
      {(canEdit || canDelete) && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => setActionsOpen((v) => !v)}
            className="rounded bg-paper-50/85 px-1.5 pb-1 pt-0 text-ink-500 backdrop-blur-sm hover:text-ink-800"
            aria-label="Opciones de foto"
            aria-expanded={actionsOpen}
            title="Opciones"
          >
            <span aria-hidden className="text-base leading-none">
              ⋯
            </span>
          </button>
          {actionsOpen && (
            <div
              role="menu"
              className="absolute right-0 top-7 z-20 w-32 rounded-xl border border-ink-100 bg-paper-50 p-1.5 shadow-xl shadow-ink-900/15"
            >
              {canEdit && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false)
                    setEditOpen(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-600 hover:bg-ink-100/60 hover:text-ink-800"
                >
                  <PencilIcon size={12} />
                  Editar
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setActionsOpen(false)
                    onDelete()
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[color:var(--accent-clay)] hover:bg-[color:var(--accent-clay-soft)]"
                >
                  <TrashIcon size={12} />
                  Eliminar
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <MomentoEditModal
        momento={momento}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </li>
  )
}

/**
 * ψ-photos-rich: agrupa primero por año, luego dentro por mes.
 * Devuelve estructura anidada para que el render pueda mostrar
 * "2026 · 36 fotos" como header de sección con sub-meses adentro.
 */
function groupByYearThenMonth(items: Momento[]): Array<{
  year: string
  months: Array<{ monthKey: string; entries: Momento[] }>
}> {
  const monthly = groupByMonth(items)
  const byYear = new Map<string, Array<{ monthKey: string; entries: Momento[] }>>()
  for (const { monthKey, entries } of monthly) {
    const year = monthKey.slice(0, 4)
    const arr = byYear.get(year) ?? []
    arr.push({ monthKey, entries })
    byYear.set(year, arr)
  }
  // Año descendente (más reciente arriba); mes dentro mantiene el orden
  // de groupByMonth (también descendente porque los items vienen así).
  return Array.from(byYear.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([year, months]) => ({ year, months }))
}
