import { useState, type ReactNode } from 'react'
import { ZoomIcon } from '../Icons'

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Tamaño de la miniatura. 'grande' = comportamiento histórico (ancho completo,
 *  16:9); los demás acotan el ancho para una miniatura más discreta. */
export type LinkMediaSize = 'pequena' | 'mediana' | 'grande'

const SIZE_FRAME: Record<LinkMediaSize, string> = {
  grande: '',
  mediana: 'max-w-[260px]',
  pequena: 'max-w-[150px]',
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
  /** Tamaño de la miniatura (default 'grande' = ancho completo). */
  size?: LinkMediaSize
  /** Si se pasa (y NO hay href), la miniatura abre el visor: doble clic con el
   *  mouse, Enter/Espacio con teclado. Para imágenes propias de la captura. */
  onOpenImage?: () => void
  /** Insignia arriba a la derecha (ej. contador de un recorte multi-imagen).
   *  Decorativa (aria-hidden): la semántica va en `ariaLabel`. */
  badge?: ReactNode
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
  size = 'grande',
  onOpenImage,
  badge,
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
      {badge && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink-900/70 px-2 py-0.5 text-micro font-medium text-paper-50/95 tabular-nums"
        >
          {badge}
        </span>
      )}
    </div>
  )

  const frameClass =
    `mb-3 block overflow-hidden rounded-md border border-ink-100/70 transition-colors hover:border-ink-200 ${SIZE_FRAME[size]} ${className}`.trim()

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel ?? `Abrir ${host ?? 'enlace'}`}
        className={frameClass}
      >
        {content}
      </a>
    )
  }

  // Imagen propia con visor: doble clic (mouse) o Enter/Espacio (teclado) abren
  // el lightbox. Sin gesto de un solo clic para no abrirlo sin querer al
  // interactuar con la tarjeta.
  if (onOpenImage) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel ?? 'Ampliar imagen'}
        title="Doble clic para ampliar"
        onDoubleClick={onOpenImage}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpenImage()
          }
        }}
        className={`group/zoom relative ${frameClass} cursor-zoom-in`}
      >
        {content}
        {/* Pista visible de que la miniatura amplía (decorativa: la acción real
            la dan el doble clic / Enter del marco). Aparece al pasar el mouse o
            enfocar con teclado. */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center justify-center rounded-full bg-ink-900/70 p-1.5 text-paper-50/95 opacity-0 transition-opacity duration-200 group-hover/zoom:opacity-100 group-focus-visible/zoom:opacity-100"
        >
          <ZoomIcon size={14} />
        </span>
      </div>
    )
  }

  return (
    <div aria-label={ariaLabel} className={frameClass}>
      {content}
    </div>
  )
}
