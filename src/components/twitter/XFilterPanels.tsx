import type { CSSProperties } from 'react'
import { FilterChip } from '../FilterChip'

/**
 * Los filtros que NO se usan siempre: buscador, autores y fechas. Cada uno se
 * despliega desde su icono en la fila de chrome — el patrón on-demand que
 * `NotasFeedView` documenta.
 *
 * Viven aparte de `TwitterView` porque son la parte ocasional de la vista, y
 * porque juntos hacían que el fichero pasara su ratchet estructural: la regla
 * del repo es extraer, no subir el umbral.
 */
export function XFilterPanels({
  searchOpen,
  query,
  onQueryChange,
  onCloseSearch,
  authorsOpen,
  authors,
  author,
  onAuthorChange,
  datesOpen,
  years,
  countForYear,
  year,
  onYearChange,
  months,
  month,
  onMonthChange,
  monthName,
  activeStyle,
}: {
  searchOpen: boolean
  query: string
  onQueryChange: (next: string) => void
  /** Escape limpia la búsqueda y repliega el panel. */
  onCloseSearch: () => void
  authorsOpen: boolean
  authors: Array<[string, number]>
  author: string | null
  onAuthorChange: (next: string | null) => void
  datesOpen: boolean
  years: number[]
  countForYear: (year: number) => number | undefined
  year: number | null
  onYearChange: (next: number | null) => void
  months: number[]
  month: number | null
  onMonthChange: (next: number | null) => void
  monthName: (month: number) => string
  /** Estilo del chip activo — el acento lo pone la vista, la forma el chip. */
  activeStyle: CSSProperties
}) {
  return (
    <>
      {searchOpen && (
        <div className="mb-3 animate-fade-up">
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar en tus bookmarks…"
            aria-label="Buscar"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCloseSearch()
            }}
            className="w-full rounded-lg border border-ink-100/60 bg-paper-50 px-3 py-1.5 text-body text-ink-700 placeholder:text-ink-300 focus:border-ink-300"
          />
        </div>
      )}

      {authorsOpen && authors.length > 0 && (
        <div className="mb-4 flex animate-fade-up flex-wrap items-center gap-1.5 border-l-2 border-ink-100 pl-3">
          {author && (
            <FilterChip
              active={false}
              onClick={() => onAuthorChange(null)}
              label="✕ quitar filtro"
            />
          )}
          {authors.slice(0, 24).map(([usuario, n]) => (
            <FilterChip
              key={usuario}
              active={author === usuario}
              onClick={() => onAuthorChange(author === usuario ? null : usuario)}
              label={`@${usuario}`}
              count={n}
              title={`${n} bookmark${n === 1 ? '' : 's'} de @${usuario}`}
              activeStyle={activeStyle}
            />
          ))}
        </div>
      )}

      {datesOpen && years.length > 0 && (
        <div className="mb-4 animate-fade-up space-y-1.5 border-l-2 border-ink-100 pl-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip
              active={year == null}
              onClick={() => onYearChange(null)}
              label="Todos los años"
              activeStyle={activeStyle}
            />
            {years.map((y) => (
              <FilterChip
                key={y}
                active={year === y}
                onClick={() => onYearChange(y)}
                label={String(y)}
                count={countForYear(y)}
                activeStyle={activeStyle}
              />
            ))}
          </div>
          {/* El mes sólo tiene sentido con un año elegido. */}
          {year != null && months.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                active={month == null}
                onClick={() => onMonthChange(null)}
                label={`Todo ${year}`}
                activeStyle={activeStyle}
              />
              {months.map((m) => (
                <FilterChip
                  key={m}
                  active={month === m}
                  onClick={() => onMonthChange(month === m ? null : m)}
                  label={monthName(m)}
                  activeStyle={activeStyle}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
