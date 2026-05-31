import { useMemo } from 'react'
import { useLocalStorageState } from '../../hooks/useLocalStorageState'
import type { Entity, Momento } from '../../types'
import { EmptyMessage } from '../EmptyMessage'
import { TrashIcon } from '../Icons'
import {
  formatMonthLabel,
  getMomentoPhotoItems,
  groupByMonth,
  momentoMediaUrl,
} from './helpers'

/**
 * Vista alternativa de Momentos: grid de fotos agrupado por mes-año
 * (o por año-y-mes en modo cronología). Toggle de tamaño de tile
 * (miniaturas / pequeño / mediano) y de modo (mensual / cronológico).
 *
 * Solo se usa cuando filtras por kind=foto y eliges "Álbum" en el
 * toggle global. Filtra implícitamente cualquier no-foto que se cuele
 * (defensa contra props mal pasados).
 */

type TileSize = 'small' | 'medium' | 'large'
type ViewMode = 'monthly' | 'yearly'

const SIZE_STORAGE_KEY = 'trama:album-size'
const MODE_STORAGE_KEY = 'trama:album-mode'
const TILE_SIZES: readonly TileSize[] = ['small', 'medium', 'large']
const VIEW_MODES: readonly ViewMode[] = ['monthly', 'yearly']

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
  const [mode, setMode] = useLocalStorageState<ViewMode>(
    MODE_STORAGE_KEY,
    'monthly',
    (raw): raw is ViewMode => VIEW_MODES.includes(raw as ViewMode),
  )

  // Para modo mensual: cada grupo es un mes-año. Para modo cronológico:
  // cada grupo es un AÑO, y dentro sub-agrupamos por mes — el ojo
  // recorre años primero, mes secundario.
  const monthlyGroups = useMemo(() => groupByMonth(photoItems), [photoItems])
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
      {/* ψ-photos-rich: toolbar — tamaño + modo de agrupación.
          Estilo: chips uppercase tracking-eyebrow para coherencia con
          los filtros de tipo. Toggle group sutil. */}
      <div className="flex flex-wrap items-center justify-between gap-3 -mt-2">
        <SegmentedToggle
          label="agrupar"
          options={[
            { value: 'monthly', label: 'mensual' },
            { value: 'yearly', label: 'cronológico' },
          ]}
          value={mode}
          onChange={(v) => setMode(v as ViewMode)}
        />
        <SegmentedToggle
          label="tamaño"
          options={[
            { value: 'small', label: 'mini' },
            { value: 'medium', label: 'medio' },
            { value: 'large', label: 'grande' },
          ]}
          value={size}
          onChange={(v) => setSize(v as TileSize)}
        />
      </div>

      {mode === 'monthly' ? (
        <div className="space-y-10">
          {monthlyGroups.map(({ monthKey, entries }) => (
            <section key={monthKey} className="animate-fade-up">
              <GroupHeader title={formatMonthLabel(monthKey)} count={entries.length} />
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
            </section>
          ))}
        </div>
      ) : (
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
      )}
    </div>
  )
}

function GroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-3">
      <h3 className="section-eyebrow-serif" style={{ color: 'var(--accent-gold)' }}>
        {title}
      </h3>
      <span className="flex-1 h-px bg-ink-100/40" />
      <span className="text-caption text-ink-300 tabular-nums">
        {count} {count === 1 ? 'foto' : 'fotos'}
      </span>
    </div>
  )
}

function SegmentedToggle({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-micro uppercase tracking-eyebrow text-ink-300">{label}</span>
      <div
        className="flex gap-0.5 p-0.5 bg-paper-100/60 rounded-md border border-ink-100/50"
        role="tablist"
        aria-label={label}
      >
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.value)}
              className={`px-2 py-0.5 rounded text-caption transition-colors ${
                active
                  ? 'bg-paper-50 text-ink-700 shadow-sm'
                  : 'text-ink-400 hover:text-ink-700'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
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

  return (
    <li className="group relative">
      <div className="aspect-square overflow-hidden rounded-md border border-ink-100/60 bg-paper-100/40 relative">
        <img
          src={momentoMediaUrl(storageKey)}
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
