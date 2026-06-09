/**
 * Control segmentado cómodo / compacto para las vistas de catálogo. Usa la
 * utility canónica `.card-segment`. Discreto a propósito — es un control de
 * poder, no debe competir con el contenido.
 */
export function DensityToggle({
  compact,
  onChange,
}: {
  compact: boolean
  onChange: (compact: boolean) => void
}) {
  const seg = (active: boolean) =>
    `px-2 py-0.5 rounded-md text-micro uppercase tracking-eyebrow transition-colors ${
      active
        ? 'bg-paper-50 text-ink-700 shadow-sm shadow-ink-900/5'
        : 'text-ink-400 hover:text-ink-600'
    }`

  return (
    <div className="card-segment" role="group" aria-label="Densidad de la lista">
      <button
        type="button"
        onClick={() => onChange(false)}
        aria-pressed={!compact}
        className={seg(!compact)}
      >
        Cómodo
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        aria-pressed={compact}
        className={seg(compact)}
      >
        Compacto
      </button>
    </div>
  )
}
