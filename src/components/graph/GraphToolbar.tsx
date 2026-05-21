import { SparkleIcon } from '../Icons'
import type { LayoutMode } from '../../hooks/layouts/types'

type Props = {
  mode: LayoutMode
  onModeChange: (mode: LayoutMode) => void
  onReorganize: () => void
  onSuggest: () => void
  suggestPending: boolean
  suggestDisabled: boolean
  zoomPercent: number
  entityCount: number
  relationshipCount: number
}

const MODE_OPTIONS: Array<{ value: LayoutMode; label: string; hint: string }> = [
  { value: 'organic', label: 'orgánico', hint: 'las conexiones se acercan' },
  { value: 'by-type', label: 'por tipo', hint: 'agrupa por persona / libro / etc' },
  { value: 'by-year', label: 'por año', hint: 'línea de tiempo horizontal' },
  { value: 'by-degree', label: 'por densidad', hint: 'los hubs al centro' },
]

export function GraphToolbar({
  mode,
  onModeChange,
  onReorganize,
  onSuggest,
  suggestPending,
  suggestDisabled,
  zoomPercent,
  entityCount,
  relationshipCount,
}: Props) {
  const activeHint = MODE_OPTIONS.find((o) => o.value === mode)?.hint ?? ''

  return (
    <>
      <div className="pointer-events-none absolute top-3 left-3 right-3 z-10 flex items-start justify-between gap-3">
        <div className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onModeChange(opt.value)}
              className={
                mode === opt.value
                  ? 'px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.15em] bg-ink-700 text-paper-50 transition-colors'
                  : 'px-3 py-1 rounded-full text-[11px] uppercase tracking-[0.15em] text-ink-400 hover:text-ink-700 transition-colors'
              }
              title={opt.hint}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={onSuggest}
            disabled={suggestPending || suggestDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-sky-700/80 hover:text-sky-900 disabled:text-ink-200 disabled:cursor-not-allowed bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm transition-colors"
            title="Propón relaciones nuevas con IA entre las entidades existentes"
          >
            {suggestPending ? (
              <>
                <span className="size-3 border-2 border-sky-700/30 border-t-sky-700 rounded-full animate-spin" />
                pensando…
              </>
            ) : (
              <>
                <SparkleIcon size={11} />
                descubrir IA
              </>
            )}
          </button>
          <button
            onClick={onReorganize}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] uppercase tracking-[0.15em] text-ink-400 hover:text-ink-700 bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm transition-colors"
            title="Reacomodar los nodos con el modo actual desde cero"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
            reorganizar
          </button>
        </div>
      </div>

      <div className="hidden md:block pointer-events-none absolute bottom-3 left-3 z-10 text-[10px] uppercase tracking-[0.2em] text-ink-300/70">
        <span>{zoomPercent}%</span>
        <span className="mx-2">·</span>
        <span>
          {entityCount} entidades · {relationshipCount} relaciones
        </span>
        <span className="mx-2">·</span>
        <span className="italic normal-case tracking-normal text-ink-400/70">{activeHint}</span>
      </div>
    </>
  )
}
