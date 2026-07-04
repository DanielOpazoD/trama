/**
 * Esqueleto genérico de sección lazy (Claves, Biblioteca, Imprenta/Planillas):
 * el primer paint ya tiene la forma del contenido — hero compacto + siluetas —
 * en vez de un spinner genérico. Mismo idioma que FeedSkeleton/HomeSkeleton:
 * «papel manchado» con shimmer sutil (el shimmer ya respeta
 * prefers-reduced-motion en index.css).
 */
export function SectionSkeleton({ variant = 'cards' }: { variant?: 'cards' | 'grid' }) {
  return (
    <div className="px-5 md:px-8 mx-auto py-8 md:py-10 max-w-5xl" aria-hidden>
      {/* hero compacto: eyebrow + título */}
      <div className="mb-6 space-y-2">
        <Line width="120px" tall="9px" tone="dim" />
        <Line width="200px" tall="26px" tone="strong" />
      </div>
      {variant === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="animate-shimmer aspect-[3/4] rounded-lg bg-ink-200/25"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="card-paper-soft space-y-2.5 rounded-xl border border-ink-100/70 p-3.5"
            >
              <Line width={`${46 + i * 12}%`} tall="14px" tone="strong" />
              <Line width="100%" tall="11px" tone="medium" />
              <Line width={`${72 - i * 8}%`} tall="11px" tone="medium" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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
      className={`animate-shimmer rounded ${toneClass}`}
      style={{ width, height: tall }}
    />
  )
}
