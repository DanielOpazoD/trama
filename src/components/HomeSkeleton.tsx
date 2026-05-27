/**
 * ω-C: skeleton dedicado del Inicio.
 *
 * Antes el loading global era un "cargando…" italic centrado — funcional
 * pero rompe la sensación premium del hero gold. Este skeleton replica
 * la silueta del HomeView (greeting eyebrow + h2 fecha + accent rule +
 * featured quote + esta semana + recent timeline) con líneas de paper
 * sutilmente animadas. El wash radial gold de fondo está incluido, así
 * que el primer paint ya muestra el carácter editorial de la sección.
 *
 * Se usa SOLO durante el primer render — una vez que entities/quotes/
 * relationships terminan de cargar, el skeleton se reemplaza por el
 * HomeView real con view-fade.
 */
export function HomeSkeleton() {
  return (
    // Mismo patrón que ViewRouter: scroll en el contenedor exterior
    // (full width) para que el trackpad capture en cualquier zona,
    // wrapper interior con max-w para limitar el ancho de lectura.
    <div id="main-scroll" className="h-full overflow-y-auto">
      <div className="px-8 py-10 pb-32 max-w-3xl mx-auto">
      <header
        className="pad-block-5 flex items-baseline justify-between gap-6 stack-3 relative"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 80% at 15% 20%, var(--accent-gold-soft) 0%, transparent 70%)',
        }}
      >
        <div className="min-w-0 stack-2">
          {/* greeting eyebrow */}
          <Line width="120px" tall="9px" tone="dim" />
          {/* h2 fecha en serif (silueta más alta + más ancha) */}
          <div className="mt-2 mb-2">
            <Line width="280px" tall="32px" tone="strong" />
          </div>
          <div className="accent-rule" />
        </div>
      </header>

      <div className="mt-8 space-y-5">
        {/* Featured quote — bloque ancho + atribución */}
        <div className="space-y-2">
          <Line width="92%" tall="18px" tone="medium" />
          <Line width="78%" tall="18px" tone="medium" />
          <div className="flex justify-end gap-2 pt-1">
            <Line width="160px" tall="11px" tone="dim" />
          </div>
        </div>

        {/* Esta semana — bloque elevado */}
        <div className="mt-10 p-4 rounded-xl border border-ink-100/40 bg-paper-50/30 space-y-2">
          <Line width="100px" tall="9px" tone="dim" />
          <div className="flex gap-4 mt-2">
            <Line width="80px" tall="16px" tone="medium" />
            <Line width="80px" tall="16px" tone="medium" />
            <Line width="80px" tall="16px" tone="medium" />
          </div>
        </div>

        {/* Recent timeline — 3 entradas */}
        <div className="mt-10 space-y-3">
          <Line width="120px" tall="9px" tone="dim" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="p-3 rounded-xl border border-ink-100/30 bg-paper-50/20 space-y-2"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <Line width={`${65 + i * 7}%`} tall="14px" tone="medium" />
              <Line width="40%" tall="11px" tone="dim" />
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  )
}

/**
 * Línea de placeholder. shimmer sutil sobre fondo ink-100 con opacity
 * baja para que se vea como "papel manchado" más que como skeleton de
 * dashboard genérico. El shimmer animation ya está en index.css
 * (animate-shimmer, respeta prefers-reduced-motion).
 */
function Line({
  width,
  tall,
  tone,
}: {
  width: string
  tall: string
  tone: 'dim' | 'medium' | 'strong'
}) {
  const toneClass =
    tone === 'strong'
      ? 'bg-ink-200/55'
      : tone === 'medium'
        ? 'bg-ink-200/35'
        : 'bg-ink-200/20'
  return (
    <div
      aria-hidden
      className={`rounded animate-shimmer ${toneClass}`}
      style={{ width, height: tall }}
    />
  )
}
