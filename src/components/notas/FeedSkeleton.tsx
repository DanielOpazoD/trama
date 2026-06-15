/**
 * Skeleton del feed de Notas (carga inicial). Reemplaza el viejo
 * `LoadingHint text="cargando"` por unas siluetas-de-card en tonos paper con
 * `animate-shimmer` — el primer paint ya tiene la forma del feed (cards
 * apiladas) en vez de un spinner genérico. Mismo idioma que `HomeSkeleton`.
 *
 * El shimmer (CSS, ya respeta `prefers-reduced-motion` en index.css) hace la
 * vida sutil sin gritar. 3 placeholders — suficiente para sugerir "hay cosas
 * llegando" sin llenar la pantalla.
 */
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="card-paper-soft rounded-xl border border-ink-100/70 p-3.5 space-y-2.5"
        >
          {/* título */}
          <Line width={`${52 + i * 9}%`} tall="16px" tone="strong" />
          {/* cuerpo */}
          <Line width="100%" tall="12px" tone="medium" />
          <Line width={`${78 - i * 6}%`} tall="12px" tone="medium" />
          {/* pie de acciones */}
          <div className="flex justify-end pt-1">
            <Line width="64px" tall="10px" tone="dim" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Línea de placeholder con shimmer sutil — "papel manchado", no skeleton de
 *  dashboard. Misma técnica que HomeSkeleton.Line. */
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
      className={`rounded animate-shimmer ${toneClass}`}
      style={{ width, height: tall }}
    />
  )
}
