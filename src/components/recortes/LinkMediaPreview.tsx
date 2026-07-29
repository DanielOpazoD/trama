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

/** Tope de la caja de una FOTO, en píxeles: ancho y alto máximos. */
const FOTO_CAJA: Record<LinkMediaSize, { ancho: number; alto: number }> = {
  grande: { ancho: 520, alto: 320 },
  mediana: { ancho: 260, alto: 220 },
  pequena: { ancho: 150, alto: 150 },
}

/** Placeholder mientras no se conoce la proporción de la foto. */
const FOTO_CAJA_PROVISIONAL = { width: 160, height: 96 }

/**
 * Caja que le corresponde a una foto: su proporción real, encogida hasta caber
 * en el tope, y nunca ampliada.
 *
 * Se calcula en vez de dejarlo al dimensionado implícito del navegador porque
 * ahí hay dos trampas encadenadas. Una: `w-fit` en el marco con un tope en
 * porcentaje en la imagen se definen mutuamente y el resultado es cero. Dos:
 * una `<img>` sin cargar mide cero, y `loading="lazy"` no carga lo que mide
 * cero — se queda esperándose a sí misma. Con la caja calculada no hay ciclo
 * que resolver: son dos números.
 */
export function cajaDeFoto(
  natural: { width: number; height: number },
  tope: { ancho: number; alto: number },
): { width: number; height: number } {
  if (!(natural.width > 0) || !(natural.height > 0)) return FOTO_CAJA_PROVISIONAL
  const escala = Math.min(tope.ancho / natural.width, tope.alto / natural.height, 1)
  return {
    width: Math.round(natural.width * escala),
    height: Math.round(natural.height * escala),
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
  /** Tamaño de la miniatura (default 'grande' = ancho completo). */
  size?: LinkMediaSize
  /** Si se pasa (y NO hay href), la miniatura abre el visor: doble clic con el
   *  mouse, Enter/Espacio con teclado. Para imágenes propias de la captura. */
  onOpenImage?: () => void
  /**
   * `enlace` recorta a 16:9 y `foto` conserva la proporción original.
   *
   * No es un gusto: la imagen de un enlace ES 16:9 —así la publica el sitio en
   * su Open Graph—, y encajarla en ese marco la muestra entera. Una foto propia
   * tiene la proporción que tenga; forzarla a 16:9 con `object-cover` recorta
   * una vertical de móvil a una banda central y se pierde más de la mitad, que
   * es justo donde suele estar lo fotografiado.
   */
  encuadre?: 'enlace' | 'foto'
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
  encuadre = 'enlace',
}: LinkMediaPreviewProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const showSkeleton = imageLoading || !imageLoaded
  const esFoto = encuadre === 'foto'
  // Antes de cargar no se conoce la proporción, así que se reserva una caja
  // neutra; al cargar pasa a la suya. Reservar la exacta desde el principio
  // pediría guardar las dimensiones en la base — desmedido para lo que se gana.
  const cajaFoto = esFoto
    ? cajaDeFoto(natural ?? { width: 0, height: 0 }, FOTO_CAJA[size])
    : null

  const content = (
    <div
      data-testid="link-media-image"
      // Un enlace vive en su 16:9 —así publica el sitio su imagen— y una foto
      // en la caja de su propia proporción.
      className={`relative overflow-hidden bg-paper-100/60 ${esFoto ? '' : 'aspect-[16/9]'}`}
      style={cajaFoto ?? undefined}
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
        onLoad={(e) => {
          const { naturalWidth: ancho, naturalHeight: alto } = e.currentTarget
          // Mientras resuelve el blob autenticado se muestra un GIF de 1×1
          // transparente, que también dispara `load`. Darlo por bueno dejaría
          // una caja de 1×1 y apagaría el esqueleto antes de tiempo.
          if (imageLoading || ancho <= 1 || alto <= 1) return
          setNatural({ width: ancho, height: alto })
          setImageLoaded(true)
        }}
        onError={() => onImageError?.()}
        // Siempre llena su caja. En una foto la caja YA tiene su proporción,
        // así que `object-cover` no recorta nada; y llenarla es lo que evita
        // que `loading="lazy"` se quede esperando a una imagen de tamaño cero.
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

  // La foto trae su caja calculada, así que el marco se le ciñe solo (`w-fit`)
  // sin tope en porcentaje: si no, una vertical dejaría el ancho sobrante vacío
  // a su lado.
  const frameClass =
    `mb-3 block overflow-hidden rounded-md border border-ink-100/70 transition-colors hover:border-ink-200 ${esFoto ? 'w-fit' : SIZE_FRAME[size]} ${className}`
      .replace(/\s+/g, ' ')
      .trim()

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
