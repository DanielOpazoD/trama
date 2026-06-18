import { useState } from 'react'
import type { Recorte } from '../../api'
import { recorteImageUrl } from '../../api/recortes'
import { youtubeThumb } from '../../lib/youtubeThumb'
import { DuplicateIcon } from '../Icons'
import { useAuthenticatedMediaState } from '../momentos/AuthenticatedMedia'
import { hostOf, LinkMediaPreview, type LinkMediaSize } from './LinkMediaPreview'
import { formatRecorteStamp } from './recorteCardModel'

const TRANSPARENT_PX =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

export { hostOf }
export type { LinkMediaSize }

export function hasRecorteMediaPreview(recorte: Recorte): boolean {
  return (
    !!recorte.imageKey ||
    !!recorte.imageUrl ||
    youtubeThumb(recorte.sourceUrl ?? '') !== null
  )
}

export function RecorteMediaPreview({
  recorte: r,
  host,
  size,
  onOpenImage,
}: {
  recorte: Recorte
  host: string | null
  size: LinkMediaSize
  onOpenImage?: () => void
}) {
  const authedSrc = r.imageKey ? recorteImageUrl(r.imageKey) : null
  const { src, status } = useAuthenticatedMediaState(authedSrc)
  const isVideo = r.captureMode === 'video'
  const derivedThumb = !r.imageKey && !r.imageUrl ? youtubeThumb(r.sourceUrl ?? '') : null
  const [thumbFailed, setThumbFailed] = useState(false)
  const shown = authedSrc ? src : (r.imageUrl ?? derivedThumb)
  const dateLabel = formatRecorteStamp(r.capturedAt ?? r.createdAt)

  if (!authedSrc && !r.imageUrl && !derivedThumb) return null

  if (!authedSrc && !r.imageUrl && thumbFailed) {
    return (
      <div
        aria-label="Vista previa sin miniatura"
        className={`mb-3 overflow-hidden rounded-md border border-ink-100/70 bg-paper-100/70 ${size === 'grande' ? '' : size === 'mediana' ? 'max-w-[260px]' : 'max-w-[150px]'}`}
      >
        <div className="flex aspect-[16/9] flex-col justify-end gap-1 px-3 py-2 text-micro text-ink-600">
          <span className="truncate font-medium text-ink-700">
            {host ?? r.sourceTitle ?? 'fuente del recorte'}
          </span>
          {dateLabel && <span className="tabular-nums">{dateLabel}</span>}
        </div>
      </div>
    )
  }

  if (isVideo && authedSrc) {
    return (
      <div
        className={`mb-3 overflow-hidden rounded-md border border-ink-100/70 bg-ink-950/90 ${size === 'grande' ? '' : size === 'mediana' ? 'max-w-[260px]' : 'max-w-[150px]'}`}
      >
        {status === 'ready' && src ? (
          <video
            src={src}
            controls
            preload="metadata"
            aria-label="Video del recorte"
            className="block aspect-video w-full bg-ink-950 object-contain"
          />
        ) : (
          <div className="flex aspect-video items-center justify-center text-caption text-paper-50/70">
            {status === 'error' ? 'No se pudo cargar el video' : 'cargando video…'}
          </div>
        )}
      </div>
    )
  }

  return (
    <LinkMediaPreview
      href={r.imageKey ? null : (r.sourceUrl ?? r.imageUrl)}
      host={host}
      dateLabel={dateLabel}
      size={size}
      badge={
        r.images.length > 1 ? (
          <>
            <DuplicateIcon size={11} />
            {r.images.length}
          </>
        ) : undefined
      }
      onOpenImage={r.imageKey ? onOpenImage : undefined}
      imageUrl={
        shown ?? (authedSrc ? TRANSPARENT_PX : (r.imageUrl ?? derivedThumb ?? ''))
      }
      imageLoading={status === 'loading'}
      ariaLabel={
        r.imageKey
          ? r.images.length > 1
            ? `Ampliar — ${r.images.length} imágenes`
            : 'Ampliar imagen'
          : r.sourceTitle
            ? `Abrir ${r.sourceTitle}`
            : undefined
      }
      onImageError={derivedThumb ? () => setThumbFailed(true) : undefined}
    />
  )
}
