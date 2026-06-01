import { AuthenticatedMomentoImage } from '../AuthenticatedMedia'

export type ExistingPhotoEditItem = {
  kind: 'existing'
  storageKey: string
  width?: number
  height?: number
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
  onSetPrimary,
  onMove,
}: {
  item: PhotoEditItem
  idx: number
  total: number
  disabled: boolean
  onRemove: () => void
  onSetPrimary: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const isPrimary = idx === 0
  return (
    <div
      className={`group relative aspect-square overflow-hidden rounded border ${
        isPrimary ? 'border-2' : 'border-ink-100/60'
      } bg-paper-100/40`}
      style={isPrimary ? { borderColor: 'var(--accent-gold)' } : undefined}
    >
      {item.kind === 'existing' ? (
        <AuthenticatedMomentoImage
          storageKey={item.storageKey}
          alt={`foto ${idx + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
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
              className="size-5 flex items-center justify-center rounded bg-ink-900/65 text-paper-50 text-xs hover:bg-ink-900/85 transition-colors leading-none"
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
              className="size-5 flex items-center justify-center rounded bg-ink-900/65 text-paper-50 text-xs hover:bg-ink-900/85 transition-colors leading-none"
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
