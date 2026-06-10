import type { Entity, Quote } from '../../types'
import { ENTITY_TYPES } from '../../types'

/**
 * Las hojas tipografiadas de "imprimir como objeto": composición editorial
 * (Spectral, márgenes de libro, colofón) pensada para papel. Solo se renderizan
 * dentro de <PrintObject> — en pantalla no existen.
 */

function fechaLarga(): string {
  return new Date().toLocaleDateString('es', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function Colofon() {
  return (
    <footer className="print-sheet-colofon">
      <span aria-hidden>·&nbsp;&nbsp;❦&nbsp;&nbsp;·</span>
      <p>Trama — compuesto en Spectral e Inter · {fechaLarga()}</p>
    </footer>
  )
}

/** Pliego de citas: las citas visibles (filtros aplicados) como cuadernillo. */
export function QuotesPrintSheet({
  quotes,
  entityName,
  authorName,
  filterLabel,
}: {
  quotes: Quote[]
  /** Nombre de la entidad de cada cita. */
  entityName: (q: Quote) => string
  /** Autor de la obra, si aplica ("— Marco Aurelio · Meditaciones"). */
  authorName?: (q: Quote) => string | undefined
  /** Descripción del filtro activo ("favoritas", "escritor"…), si hay. */
  filterLabel?: string
}) {
  return (
    <article className="print-sheet">
      <header>
        <p className="print-sheet-eyebrow">
          pliego de citas{filterLabel ? ` · ${filterLabel}` : ''}
        </p>
        <h1>Citas</h1>
        <div className="print-sheet-rule" aria-hidden />
        <p className="print-sheet-meta">
          {quotes.length} {quotes.length === 1 ? 'fragmento' : 'fragmentos'} retuvidos
          hasta el {fechaLarga()}
        </p>
      </header>
      {quotes.map((q) => {
        const author = authorName?.(q)
        return (
          <blockquote key={q.id} className="print-sheet-quote">
            <p>«{q.text}»</p>
            <cite>
              — {author ? `${author} · ` : ''}
              {entityName(q)}
              {q.source ? ` · ${q.source}` : ''}
            </cite>
          </blockquote>
        )
      })}
      <Colofon />
    </article>
  )
}

/** Ficha de catálogo de una entidad: nombre, registro, descripción y sus citas. */
export function EntityPrintSheet({
  entity,
  quotes,
}: {
  entity: Entity
  quotes: Quote[]
}) {
  const typeLabel =
    ENTITY_TYPES.find((t) => t.value === entity.type)?.label ?? entity.type
  return (
    <article className="print-sheet">
      <header>
        <p className="print-sheet-eyebrow">ficha de catálogo</p>
        <h1>{entity.name}</h1>
        <div className="print-sheet-rule" aria-hidden />
        <p className="print-sheet-meta">
          {typeLabel}
          {entity.year ? ` · ${entity.year}` : ''}
        </p>
      </header>
      {entity.description && <p className="print-sheet-prose">{entity.description}</p>}
      {entity.essay && <p className="print-sheet-prose">{entity.essay}</p>}
      {quotes.length > 0 && (
        <>
          <p className="print-sheet-section">sus citas</p>
          {quotes.map((q) => (
            <blockquote key={q.id} className="print-sheet-quote">
              <p>«{q.text}»</p>
              {q.source && <cite>— {q.source}</cite>}
            </blockquote>
          ))}
        </>
      )}
      <Colofon />
    </article>
  )
}
