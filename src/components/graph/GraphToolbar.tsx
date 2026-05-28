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
  /** Programmatic zoom controls, from usePanZoom. */
  onZoomIn?: () => void
  onZoomOut?: () => void
  /** Resetea zoom a 100% y pan a (0,0) — útil después de perderse navegando. */
  onResetView?: () => void
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
  { value: 'by-degree', label: 'por densidad', hint: 'los hubs al centro' },
  { value: 'organic', label: 'orgánico', hint: 'las conexiones se acercan' },
  { value: 'by-type', label: 'por tipo', hint: 'agrupa por persona / libro / etc' },
  { value: 'by-year', label: 'por año', hint: 'línea de tiempo horizontal' },
]

/**
 * Clases base reutilizadas — el toolbar tenía botones grandes (px-3 py-1.5
 * text-caption). Se sentían desproporcionados respecto al grafo. Bajamos a
 * px-2 py-0.5 text-micro: ~30% menos área visual, sin perder readability
 * ni tap target (mínimo recomendado 24×24px, acá quedamos en ~26×22).
 */
const SEGMENT_BTN_BASE =
  'px-2 py-0.5 rounded-full text-micro uppercase tracking-eyebrow transition-colors'
const SEGMENT_BTN_INACTIVE = 'text-ink-400 hover:text-ink-700'
const SEGMENT_BTN_ACTIVE = 'bg-ink-700 text-paper-50'
const SEGMENT_PILL_WRAPPER =
  'pointer-events-auto flex items-center gap-0.5 px-1.5 py-1 bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm'

export function GraphToolbar({
  mode,
  onModeChange,
  onReorganize,
  onSuggest,
  suggestPending,
  suggestDisabled,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onResetView,
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
      {/* Top bar — modos + acciones IA + reorganizar */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 z-10 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Layout modes */}
          <div className={SEGMENT_PILL_WRAPPER}>
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onModeChange(opt.value)}
                className={`${SEGMENT_BTN_BASE} ${
                  mode === opt.value ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
                }`}
                title={opt.hint}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Graph scope: completo / exploratorio */}
          <div className={SEGMENT_PILL_WRAPPER}>
            <button
              onClick={() => onGraphModeChange('completo')}
              className={`${SEGMENT_BTN_BASE} ${
                graphMode === 'completo' ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
              }`}
              title="Ver el grafo completo. A 100k+ entidades cambia a exploratorio."
            >
              completo
            </button>
            <button
              onClick={() => onGraphModeChange('exploratorio')}
              className={`${SEGMENT_BTN_BASE} ${
                graphMode === 'exploratorio' ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
              }`}
              title="Arranca en una entidad focal y abre vecinos al hacer click. Necesario a partir de ~2-5k nodos."
            >
              explorar
            </button>
          </div>
        </div>

        {/* Acciones */}
        <div className="pointer-events-auto flex items-center gap-2">
          {graphMode === 'exploratorio' && onFocusSelected && (
            <button
              onClick={onFocusSelected}
              disabled={focusSelectedDisabled}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 section-eyebrow hover:text-ink-700 bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                <span
                  className="size-3 border-2 rounded-full animate-spin"
                  style={{
                    borderColor: `var(--accent-primary-ring)`,
                    borderTopColor: `var(--accent-primary)`,
                  }}
                />
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1 section-eyebrow hover:text-ink-700 bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm transition-colors"
            title="Reacomodar los nodos con el modo actual desde cero"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
            reorganizar
          </button>
        </div>
      </div>

      {/* Zoom + reset cluster — esquina inferior derecha, mismo lenguaje
          visual que las pills de arriba pero más compacto. Iconos en vez
          de texto para reducir más el footprint visual.

          [−] [100%] [+]  [⌂ reset]

          El "100%" es display-only (no es botón), pero al hacer click en
          él se vuelve a 100% (mejor que tener un botón aparte). */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-2">
        {onZoomOut && onZoomIn && (
          <div className="pointer-events-auto flex items-center bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm overflow-hidden">
            <button
              onClick={onZoomOut}
              aria-label="Alejar zoom"
              title="Alejar (− / scroll abajo)"
              className="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-100/40 transition-colors"
            >
              <ZoomOutIcon size={12} />
            </button>
            <span
              className="px-2 section-eyebrow tabular-nums select-none min-w-[3rem] text-center"
              title="Zoom actual"
            >
              {zoomPercent}%
            </span>
            <button
              onClick={onZoomIn}
              aria-label="Acercar zoom"
              title="Acercar (+ / scroll arriba)"
              className="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-ink-700 hover:bg-ink-100/40 transition-colors"
            >
              <ZoomInIcon size={12} />
            </button>
          </div>
        )}
        {onResetView && (
          <button
            onClick={onResetView}
            aria-label="Centrar vista"
            title="Centrar vista (100% + pan al origen)"
            className="pointer-events-auto w-7 h-7 flex items-center justify-center text-ink-400 hover:text-ink-700 bg-paper-50/85 backdrop-blur-md border border-ink-100/60 rounded-full shadow-sm transition-colors"
          >
            <HandIcon size={12} />
          </button>
        )}
      </div>

      {/* Stat bar inferior izquierdo — counts + hint del modo activo */}
      <div className="hidden md:block pointer-events-none absolute bottom-3 left-3 z-10 text-micro uppercase tracking-eyebrow text-ink-300/70">
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
        <span className="italic normal-case tracking-normal text-ink-400/70">
          {activeHint}
        </span>
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   Inline icons del cluster de zoom. Pequeños, stroke 2.2 para que se
   vean a 12px sin convertirse en manchas. Co-localizados acá porque
   solo se usan en este componente.
   ───────────────────────────────────────────────────────────────────── */

function ZoomInIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35M8 11h6M11 8v6" />
    </svg>
  )
}

function ZoomOutIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35M8 11h6" />
    </svg>
  )
}

function HandIcon({ size = 12 }: { size?: number }) {
  // Icono "centrar vista" — un cuadrado con flechas hacia adentro,
  // metáfora visual de "todo vuelve al centro". Más claro que una mano
  // (que sugiere drag, pero el drag ya funciona naturalmente).
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
