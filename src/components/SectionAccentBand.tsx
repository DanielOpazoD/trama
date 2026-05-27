import type { ViewMode } from './Sidebar'
import { SECTION_ACCENT } from '../lib/sectionAccent'

/**
 * Banda fina (2px) que vive justo debajo del TopBar, en el color de la
 * sección activa. Es el detalle de marca que ata el chrome (topbar,
 * sidebar, nav) con el contenido. Cambia con view-fade cuando navegás
 * de una sección a otra — el ojo siente "estoy en otra sala".
 *
 * Composición: un gradient lineal que va de transparent → accent →
 * transparent, con el pico en 50%. Las puntas no se ven en pantallas
 * angostas (efecto "rayo de luz que entra por una ventana ancha").
 *
 * `prefers-reduced-motion` mantiene el color final sin la transición.
 */
export function SectionAccentBand({ view }: { view: ViewMode }) {
  const accent = SECTION_ACCENT[view]
  return (
    <div
      aria-hidden
      className="h-[2px] w-full shrink-0 transition-[background] duration-300 ease-out"
      style={{
        // Gradient con pico más amplio (40-60%) para que la banda sea
        // visible en pantallas anchas. Las CSS vars del accent se
        // ajustan por tema (light/dark/vela) automáticamente.
        backgroundImage: `linear-gradient(90deg, transparent 0%, ${accent} 40%, ${accent} 60%, transparent 100%)`,
      }}
    />
  )
}
