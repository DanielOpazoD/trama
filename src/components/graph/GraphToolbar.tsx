import { SparkleIcon } from '../Icons'
import type { LayoutMode } from '../../hooks/layouts/types'

export type GraphMode = 'completo' | 'exploratorio'

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
  graphMode: GraphMode
  onGraphModeChange: (m: GraphMode) => void
  // Optional info for explorer mode
  focusName?: string | null
  truncated?: boolean
  /** When set and graphMode='exploratorio', a "hacer foco" button appears
      to swap the focal entity to the currently-selected one. */
  onFocusSelected?: () => void
  focusSelectedDisabled?: boolean
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
  graphMode,
  onGraphModeChange,
  focusName,
  truncated,
  onFocusSelected,
  focusSelectedDisabled,
}: Props) {
  const activeHint = MODE_OPTIONS.find((o) => o.value === mode)?.hint ?? ''

  return (
    <>
      <div className="pointer-events-none absolute top-3 left-3 right-3 z-10 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onModeChange(opt.value)}
                className={
                  mode === opt.value
                    ? 'px-3 py-1 rounded-full text-caption uppercase tracking-eyebrow bg-ink-700 text-paper-50 transition-colors'
                    : 'px-3 py-1 rounded-full text-caption uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors'
                }
                title={opt.hint}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm">
            <button
              onClick={() => onGraphModeChange('completo')}
              className={
                graphMode === 'completo'
                  ? 'px-3 py-1 rounded-full text-caption uppercase tracking-eyebrow bg-ink-700 text-paper-50 transition-colors'
                  : 'px-3 py-1 rounded-full text-caption uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors'
              }
              title="Ver el grafo completo. A 100k+ entidades cambia a exploratorio."
            >
              completo
            </button>
            <button
              onClick={() => onGraphModeChange('exploratorio')}
              className={
                graphMode === 'exploratorio'
                  ? 'px-3 py-1 rounded-full text-caption uppercase tracking-eyebrow bg-ink-700 text-paper-50 transition-colors'
                  : 'px-3 py-1 rounded-full text-caption uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors'
              }
              title="Arranca en una entidad focal y abre vecinos al hacer click. Necesario a partir de ~2-5k nodos."
            >
              explorar
            </button>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {graphMode === 'exploratorio' && onFocusSelected && (
            <button
              onClick={onFocusSelected}
              disabled={focusSelectedDisabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-caption uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Mover el foco del subgrafo a la entidad seleccionada"
            >
              hacer foco
            </button>
          )}
          <button
            onClick={onSuggest}
            disabled={suggestPending || suggestDisabled}
            className="ai-cta-pill"
            title="Propón relaciones nuevas con IA entre las entidades existentes"
          >
            {suggestPending ? (
              <>
                <span className="size-3 border-2 rounded-full animate-spin" style={{ borderColor: `var(--accent-primary-ring)`, borderTopColor: `var(--accent-primary)` }} />
                pensando…
              </>
            ) : (
              <>
                <SparkleIcon size={12} />
                descubrir IA
              </>
            )}
          </button>
          <button
            onClick={onReorganize}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-caption uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm transition-colors"
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

      <div className="hidden md:block pointer-events-none absolute bottom-3 left-3 z-10 text-micro uppercase tracking-eyebrow text-ink-300/70">
        <span>{zoomPercent}%</span>
        <span className="mx-2">·</span>
        <span>
          {entityCount} entidades · {relationshipCount} relaciones
          {truncated && <span className="ml-1 text-amber-700/70">· truncado</span>}
        </span>
        {graphMode === 'exploratorio' && focusName && (
          <>
            <span className="mx-2">·</span>
            <span className="italic normal-case tracking-normal text-ink-400/70">
              foco: {focusName}
            </span>
          </>
        )}
        <span className="mx-2">·</span>
        <span className="italic normal-case tracking-normal text-ink-400/70">{activeHint}</span>
      </div>
    </>
  )
}
