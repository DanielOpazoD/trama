import { OrnamentBreak, EndMark } from './Icons'

/**
 * Paginator editorial — barra de paginación para listas con
 * infinite scroll opcional. Reemplaza el patrón "más atrás ↓" / "cargando
 * más…" que vivía duplicado en EntitiesView, QuotesView, MomentosView,
 * RelationshipsView.
 *
 * Diseño:
 *   - `hasNext === true`: ornament-break centrado + botón "más atrás ↓"
 *   - `loading === true`: ornament-break con "cargando…" subdued
 *   - `hasNext === false` + showEndMark: end-mark editorial (✦ chico)
 *
 * Los tres estados ocupan el mismo footprint vertical para que el list
 * no salte cuando cambia de "cargar más" a "fin de página".
 */
export function Paginator({
  hasNext,
  loading,
  onLoadMore,
  showEndMark = true,
  endMarkSize = 14,
}: {
  hasNext: boolean
  loading: boolean
  onLoadMore: () => void
  /** Si false, no muestra el ✦ de cierre. Útil para vistas con poca
      data (donde el end-mark se ve absurdo arriba de un único item). */
  showEndMark?: boolean
  endMarkSize?: number
}) {
  if (hasNext) {
    return (
      <div className="flex flex-col items-center gap-2 pt-6 text-ink-300">
        <OrnamentBreak className="ornament" />
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loading}
          className="section-eyebrow hover:text-ink-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'cargando más…' : 'más atrás ↓'}
        </button>
      </div>
    )
  }
  if (!showEndMark) return null
  return (
    <div className="flex flex-col items-center gap-2 pt-8 text-ink-300">
      <OrnamentBreak className="ornament" />
      <EndMark size={endMarkSize} />
    </div>
  )
}
