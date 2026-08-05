import { AuthenticatedMomentoImage, MomentoVideoThumb } from '../AuthenticatedMedia'
import { PencilIcon } from '../../Icons'
import { IconButton } from '../../IconButton'
import { VideoPlayBadge } from '../VideoPlayBadge'

export type ExistingPhotoEditItem = {
  kind: 'existing'
  storageKey: string
  width?: number
  height?: number
  /** ω-video: 'video' si el item ya guardado es un clip (no una foto). */
  type?: 'image' | 'video'
  /** Póster del clip; la tile lo monta como <img> en vez de bajar el video. */
  posterStorageKey?: string
  /** Miniatura derivada de una foto; ídem, la tile no baja el original. */
  thumbStorageKey?: string
  /** Color dominante para el placeholder del tile. */
  dominantColor?: string
}

export type NewPhotoEditItem = {
  kind: 'new'
  file: File
  previewUrl: string
}

export type PhotoEditItem = ExistingPhotoEditItem | NewPhotoEditItem

/**
 * Card por foto en la grilla de FotoEditModal: preview + acciones hover
 * para quitar, marcar portada y reordenar.
 */
export function FotoPhotoTile({
  item,
  idx,
  total,
  disabled,
  onRemove,
  onEdit,
  onSetPrimary,
  onMove,
}: {
  item: PhotoEditItem
  idx: number
  total: number
  disabled: boolean
  onRemove: () => void
  onEdit: () => void
  onSetPrimary: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const isPrimary = idx === 0
  // Los items 'new' del modal de edición siempre son fotos (addFiles filtra
  // image/); solo un item ya guardado puede ser un clip.
  const isExistingVideo = item.kind === 'existing' && item.type === 'video'
  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded border ${
        isPrimary ? 'border-2' : 'border-ink-100/60'
      } bg-paper-100/40`}
      style={isPrimary ? { borderColor: 'var(--accent-gold)' } : undefined}
    >
      {item.kind === 'existing' ? (
        isExistingVideo ? (
          <>
            <MomentoVideoThumb
              storageKey={item.storageKey}
              posterStorageKey={item.posterStorageKey}
              alt={`video ${idx + 1}`}
              className="w-full h-full object-cover"
            />
            <VideoPlayBadge size="sm" />
          </>
        ) : (
          <AuthenticatedMomentoImage
            storageKey={item.thumbStorageKey ?? item.storageKey}
            alt={`foto ${idx + 1}`}
            className="w-full h-full object-cover"
            loading="lazy"
            placeholderColor={item.dominantColor}
          />
        )
      ) : (
        <img
          src={item.previewUrl}
          alt={`foto ${idx + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 size-5 flex items-center justify-center rounded-full bg-ink-900/70 text-paper-50 text-xs hover:bg-ink-900 transition-colors"
        aria-label={`Quitar foto ${idx + 1}`}
        title="Quitar"
        disabled={disabled}
      >
        ×
      </button>
      {isPrimary ? (
        <span
          className="absolute top-1 left-1 text-micro uppercase tracking-eyebrow px-1.5 py-0.5 rounded leading-none font-medium"
          style={{ backgroundColor: 'var(--accent-gold)', color: '#fff' }}
        >
          ★ portada
        </span>
      ) : (
        <button
          type="button"
          onClick={onSetPrimary}
          className="absolute top-1 left-1 text-micro uppercase tracking-eyebrow px-1.5 py-0.5 rounded leading-none bg-ink-900/55 text-paper-50 hover:bg-ink-900/80 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          title="Marcar como portada"
          disabled={disabled}
        >
          ★ portada
        </button>
      )}
      <span className="absolute bottom-1 left-1 text-micro tabular-nums bg-ink-900/60 text-paper-50 px-1 rounded leading-none py-0.5">
        {idx + 1}
      </span>
      {/* El editor de imágenes no opera sobre video. */}
      {!isExistingVideo && (
        <IconButton
          onClick={onEdit}
          className="absolute bottom-1 left-7 size-5 flex items-center justify-center rounded bg-ink-900/65 text-paper-50 hover:bg-ink-900/85 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          label={`Editar foto ${idx + 1}`}
          title="Editar foto"
          disabled={disabled}
        >
          <PencilIcon size={11} />
        </IconButton>
      )}
      {item.kind === 'new' && (
        <span
          className="absolute top-1 right-7 text-micro uppercase tracking-eyebrow bg-[color:var(--accent-sage)] text-paper-50 px-1 rounded leading-none py-0.5"
          title="Foto nueva — se subirá al guardar"
        >
          nueva
        </span>
      )}
      {total > 1 && (
        <div className="absolute bottom-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {idx > 0 && (
            <button
              type="button"
              onClick={() => onMove(-1)}
              className="size-5 flex items-center justify-center rounded bg-ink-900/65 text-paper-50 text-caption hover:bg-ink-900/85 transition-colors leading-none"
              aria-label={`Mover foto ${idx + 1} hacia atrás`}
              title="Mover atrás"
              disabled={disabled}
            >
              ‹
            </button>
          )}
          {idx < total - 1 && (
            <button
              type="button"
              onClick={() => onMove(1)}
              className="size-5 flex items-center justify-center rounded bg-ink-900/65 text-paper-50 text-caption hover:bg-ink-900/85 transition-colors leading-none"
              aria-label={`Mover foto ${idx + 1} hacia adelante`}
              title="Mover adelante"
              disabled={disabled}
            >
              ›
            </button>
          )}
        </div>
      )}
    </div>
  )
}
