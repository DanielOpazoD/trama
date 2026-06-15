import { useState } from 'react'

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

type LinkMediaPreviewProps = {
  href?: string | null
  host?: string | null
  dateLabel?: string | null
  imageUrl: string
  imageAlt?: string
  imageLoading?: boolean
  ariaLabel?: string
  className?: string
  /** Avisa cuando la imagen no carga, para que el caller pueda ocultarla. */
  onImageError?: () => void
}

/**
 * Marco de medios de un recorte/favorito: SOLO se monta cuando hay una imagen
 * real que mostrar (imagen del recorte, OG, o miniatura derivada de YouTube).
 * El caso «sin imagen» ya no se renderiza acá — el caller muestra el origen
 * como un eyebrow discreto sobre el título.
 */
export function LinkMediaPreview({
  href,
  host,
  dateLabel,
  imageUrl,
  imageAlt = '',
  imageLoading = false,
  ariaLabel,
  className = '',
  onImageError,
}: LinkMediaPreviewProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const showSkeleton = imageLoading || !imageLoaded

  const content = (
    <div
      data-testid="link-media-image"
      className="relative aspect-[16/9] overflow-hidden bg-paper-100/60"
    >
      {showSkeleton && (
        <div
          data-testid="link-media-skeleton"
          className="absolute inset-0 animate-pulse-subtle bg-ink-100/60"
        />
      )}
      <img
        src={imageUrl}
        alt={imageAlt}
        loading="lazy"
        onLoad={() => setImageLoaded(true)}
        onError={() => onImageError?.()}
        className={`h-full w-full object-cover transition-transform duration-500 ${
          imageLoaded ? 'opacity-100 group-hover:scale-[1.025]' : 'opacity-0'
        }`}
      />
      {(host || dateLabel) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-ink-900/60 to-transparent px-3 pb-2 pt-8 text-micro text-paper-50/85">
          <span className="truncate">{host}</span>
          {dateLabel && <span className="shrink-0 tabular-nums">{dateLabel}</span>}
        </div>
      )}
    </div>
  )

  const frameClass =
    `mb-3 block overflow-hidden rounded-md border border-ink-100/70 transition-colors hover:border-ink-200 ${className}`.trim()

  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel ?? `Abrir ${host ?? 'enlace'}`}
      className={frameClass}
    >
      {content}
    </a>
  ) : (
    <div aria-label={ariaLabel} className={frameClass}>
      {content}
    </div>
  )
}
