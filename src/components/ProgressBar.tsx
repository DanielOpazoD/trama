/**
 * Barra de progreso editorial — para operaciones largas donde el usuario
 * necesita saber "cuánto falta", no solo "estoy ocupado".
 *
 * Sustituye al patrón "leyendo…" / "pensando…" italic en flujos como:
 *   - ReadingMode (procesar texto por chunks)
 *   - ReindexEmbeddings (batches de 25)
 *   - ImportPlaylist (track por track)
 *
 * Diseño:
 *   - Barra delgada (h-1.5) con accent-primary
 *   - Label arriba con counter "X de Y" en mono tabular
 *   - Hint opcional abajo en italic
 *   - Indeterminate state: cuando current === null, anima la barra
 *     deslizándose (no sabemos el total)
 *
 * Cuando `current/total >= 0.99`, el color cambia a sage — sugiere
 * "ya casi". Es un pequeño guiño de progreso visual.
 */

export function ProgressBar({
  label,
  current,
  total,
  hint,
}: {
  label: string
  /** Si null, la barra es indeterminate (animación shimmer). */
  current?: number | null
  total?: number
  hint?: string
}) {
  const indeterminate = current == null || total == null || total <= 0
  const pct = indeterminate ? 0 : Math.min(100, Math.max(0, (current! / total!) * 100))
  const almostDone = pct >= 99

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink-600">{label}</span>
        {!indeterminate && (
          <span className="font-mono text-micro text-ink-400 tabular-nums">
            {current}/{total}
          </span>
        )}
      </div>
      <div
        className="h-1.5 rounded-full bg-ink-100/60 overflow-hidden"
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : (current ?? undefined)}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
      >
        {indeterminate ? (
          <div
            className="h-full w-1/3 rounded-full progress-indeterminate"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          />
        ) : (
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              backgroundColor: almostDone
                ? 'var(--accent-sage)'
                : 'var(--accent-primary)',
            }}
          />
        )}
      </div>
      {hint && <p className="text-micro text-ink-300 italic leading-relaxed">{hint}</p>}
    </div>
  )
}
