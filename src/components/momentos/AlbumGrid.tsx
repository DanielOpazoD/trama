import { useMemo, useState } from 'react'
import type { Entity, Momento } from '../../types'
import { EmptyMessage } from '../EmptyMessage'
import { PencilIcon, TrashIcon } from '../Icons'
import { AuthenticatedMomentoImage, MomentoVideoThumb } from './AuthenticatedMedia'
import {
  formatMonthLabel,
  getMomentoPhotoItems,
  groupByMonth,
  isVideoItem,
  momentoItemThumbKey,
} from './helpers'
import { MomentoEditModal } from './MomentoEditModal'
import { MomentoFeedback } from './MomentoFeedback'
import { PhotoLightbox } from './PhotoLightbox'
import { VideoPlayBadge } from './VideoPlayBadge'

/**
 * Vista alternativa de Momentos: grid de fotos en cronología año → mes.
 * El único ajuste visible es el tamaño de tile, guardado como preferencia.
 *
 * Solo se usa cuando filtras por kind=foto y eliges "Álbum" en el
 * toggle global. Filtra implícitamente cualquier no-foto que se cuele
 * (defensa contra props mal pasados).
 */

import { TILE_SIZES, type TileSize } from './useAlbumTileSize'

export type { TileSize }

const SIZE_LABELS: Record<TileSize, string> = {
  small: 'mini',
  medium: 'medio',
  large: 'grande',
}

const SIZE_GRID_CLASS: Record<TileSize, string> = {
  // ψ-photos-rich / ω-mosaico: pequeño = grilla densa cuadrada tipo
  // Instagram (escaneo rápido); mediano y grande = mosaico en columnas
  // (masonry tipo Pinterest) donde cada tile conserva el alto real de su
  // foto/video en vez de recortarse a cuadrado. El gap horizontal lo da
  // `gap-*`; el vertical, `mb-*` en cada <li> (space-y no aplica a
  // multicolumn).
  small: 'grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-1.5',
  medium: 'columns-2 sm:columns-3 md:columns-4 gap-3 [&>li]:mb-3',
  large: 'columns-1 sm:columns-2 md:columns-3 gap-4 [&>li]:mb-4',
}

export function AlbumGrid({
  items,
  entitiesById,
  onDelete,
  size,
}: {
  items: Momento[]
  entitiesById: Map<string, Entity>
  onDelete: (id: string) => void
  /** El control vive en la barra, junto a los demás de vista — antes se
      renderizaba aquí y se comía una fila entera para sí solo. */
  size: TileSize
}) {
  const photoItems = useMemo(() => items.filter((m) => m.kind === 'foto'), [items])
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
    <div className="space-y-4">
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

export function SizeMenu({
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
  const cover = photos[0]
  const coverIsVideo = cover ? isVideoItem(cover) : false
  const extraCount = Math.max(photos.length - 1, 0)
  const linkedEntities = momento.entityIds
    .map((id) => entitiesById.get(id))
    .filter((e): e is Entity => Boolean(e))
  const [actionsOpen, setActionsOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  if (!cover) return null
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
  // ω-mosaico: en medio/grande el tile respeta el aspect-ratio real de la
  // portada; en mini —o si la foto no trae dimensiones— se mantiene cuadrado.
  const coverAspect =
    cover.width && cover.height && cover.width > 0 && cover.height > 0
      ? `${cover.width} / ${cover.height}`
      : undefined
  const useRealAspect = size !== 'small' && !!coverAspect

  return (
    <li className="group relative break-inside-avoid">
      <div
        className={`overflow-hidden rounded-md border border-ink-100/60 bg-paper-100/40 relative ${
          useRealAspect ? '' : 'aspect-square'
        }`}
        style={useRealAspect ? { aspectRatio: coverAspect } : undefined}
      >
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label={
            photos.length === 1
              ? coverIsVideo
                ? 'Abrir video'
                : 'Abrir foto'
              : `Abrir visor de ${photos.length} elementos`
          }
          className="relative block h-full w-full cursor-zoom-in overflow-hidden focus-ring-inset"
        >
          {coverIsVideo ? (
            <>
              {/* ω-video: la miniatura es el póster (o el <video> si el clip
                  no trae uno); el click abre el visor, que reproduce. */}
              <MomentoVideoThumb
                storageKey={cover.storageKey}
                posterStorageKey={cover.posterStorageKey}
                alt={caption ?? 'momento'}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                placeholderColor={cover.dominantColor}
              />
              <VideoPlayBadge />
            </>
          ) : (
            <AuthenticatedMomentoImage
              // La tile monta la miniatura derivada (~480px) si existe; el
              // original queda para el visor. Ver momentoItemThumbKey.
              storageKey={momentoItemThumbKey(cover)}
              alt={caption ?? 'momento'}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              placeholderColor={cover.dominantColor}
            />
          )}
        </button>
        {extraCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 text-micro tabular-nums bg-ink-900/65 text-paper-50 px-1.5 py-0.5 rounded leading-none"
            aria-hidden
          >
            +{extraCount}
          </span>
        )}
        <div className="pointer-events-none absolute left-1.5 bottom-1.5">
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
            <span aria-hidden className="text-lead leading-none">
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
      <PhotoLightbox
        photos={photos}
        caption={caption}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
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
