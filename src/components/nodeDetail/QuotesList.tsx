import { useQuotesQuery } from '../../state'
import type { Entity } from '../../types'
import { QuoteCard } from '../QuoteCard'

/**
 * Lista de citas/notas atribuidas a esta entidad.
 *
 * Pasa a cada QuoteCard sus citas vinculadas (`linkedQuoteIds` resueltas
 * contra el cache global), para que el rendering inline de chips funcione.
 *
 * Si la entidad no tiene citas, no renderiza nada — el padre tiene
 * un placeholder visual en el espacio.
 */
export function QuotesList({ entity }: { entity: Entity }) {
  const { data: quotes = [] } = useQuotesQuery()
  const entityQuotes = quotes.filter((q) => q.entityId === entity.id)

  if (entityQuotes.length === 0) return null

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-ink-400 mb-3">
        {entityQuotes.length === 1 ? 'Cita / nota' : `${entityQuotes.length} citas / notas`}
      </h3>
      <ul className="space-y-5">
        {entityQuotes.map((quote) => {
          const linkedQuotes = quote.linkedQuoteIds
            .map((id) => quotes.find((q) => q.id === id))
            .filter((q): q is NonNullable<typeof q> => q !== undefined)
          return (
            <QuoteCard
              key={quote.id}
              quote={quote}
              linkedQuotes={linkedQuotes}
            />
          )
        })}
      </ul>
    </section>
  )
}
