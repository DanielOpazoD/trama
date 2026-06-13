import { useState } from 'react'

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function faviconFor(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${host}&sz=64`
}

type LinkMediaPreviewProps = {
  href?: string | null
  host?: string | null
  dateLabel?: string | null
  imageUrl?: string | null
  imageAlt?: string
  imageLoading?: boolean
  ariaLabel?: string
  className?: string
}

export function LinkMediaPreview({
  href,
  host,
  dateLabel,
  imageUrl,
  imageAlt = '',
  imageLoading = false,
  ariaLabel,
  className = '',
}: LinkMediaPreviewProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState(false)
  const showImage = Boolean(imageUrl) && !imageFailed
  const showSkeleton = showImage && (imageLoading || !imageLoaded)

  const content = showImage ? (
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
        src={imageUrl ?? ''}
        alt={imageAlt}
        loading="lazy"
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageFailed(true)}
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
  ) : (
    <div
      data-testid="link-media-fallback"
      className="relative min-h-24 overflow-hidden bg-paper-100/50 px-3 py-3"
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(37, 34, 29, 0.06) 0 1px, transparent 1px 11px)',
        }}
      />
      <div aria-hidden className="relative mb-3">
        <div className="border-t-2 border-ink-700/35" />
        <div className="mt-0.5 border-t border-ink-200/70" />
      </div>
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-micro uppercase tracking-eyebrow text-ink-300">
            material guardado
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            {host && !faviconFailed ? (
              <img
                src={faviconFor(host)}
                alt=""
                loading="lazy"
                onError={() => setFaviconFailed(true)}
                className="h-4 w-4 shrink-0 rounded-sm opacity-80"
              />
            ) : (
              <span
                aria-hidden
                className="h-4 w-4 shrink-0 rounded-sm border border-ink-200 bg-paper-50/80"
              />
            )}
            <span className="truncate font-serif text-base text-ink-700">
              {host ?? 'sin dominio'}
            </span>
          </div>
        </div>
        {dateLabel && (
          <span className="shrink-0 text-micro uppercase tracking-wider text-ink-300 tabular-nums">
            {dateLabel}
          </span>
        )}
      </div>
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
