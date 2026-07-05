import { PlayIcon } from '../Icons'

/**
 * ω-video: distintivo de "esto es un clip" — un disco semitransparente con
 * el triángulo de play, centrado sobre el póster. Se usa allí donde el video
 * aún no se reproduce: el preview del composer, el tile del álbum y las
 * miniaturas del filmstrip.
 *
 * Puramente ornamental (`aria-hidden`): el elemento que lo envuelve ya lleva
 * el rol y el label accesibles. Se posiciona absoluto, así que el contenedor
 * debe ser `relative`.
 */
export function VideoPlayBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const disc = size === 'sm' ? 'size-6' : 'size-9'
  const icon = size === 'sm' ? 11 : 15
  return (
    <span
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden
    >
      <span
        className={`${disc} flex items-center justify-center rounded-full bg-ink-900/50 text-paper-50 backdrop-blur-sm ring-1 ring-white/15`}
      >
        {/* Los triángulos de play se ven descentrados; un nudge óptico los
            asienta en el centro del disco. */}
        <span className="ml-0.5">
          <PlayIcon size={icon} />
        </span>
      </span>
    </span>
  )
}
