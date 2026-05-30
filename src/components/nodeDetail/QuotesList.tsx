import { useState } from 'react'
import { useQuotesQuery } from '../../state'
import type { Entity } from '../../types'
import { PlusIcon } from '../Icons'
import { QuoteCard } from '../QuoteCard'
import { QuickNoteForm } from './QuickNoteForm'

/**
 * Sección "Citas" del panel de detalle.
 *
 * Encabezado en una sola línea: el título (count + label) a la izquierda y un
 * "+" discreto en la esquina derecha para añadir. Siempre se renderiza —
 * aunque la entidad no tenga citas — para que el "+" esté siempre disponible.
 * Al tocarlo se despliega el formulario (QuickNoteForm) debajo del encabezado.
 *
 * Pasa a cada QuoteCard sus citas vinculadas (`linkedQuoteIds` resueltas
 * contra el cache global), para que el rendering inline de chips funcione.
 */
export function QuotesList({ entity }: { entity: Entity }) {
  const { data: quotes = [] } = useQuotesQuery()
  const entityQuotes = quotes.filter((q) => q.entityId === entity.id)
  const [adding, setAdding] = useState(false)

  const title =
    entityQuotes.length === 0
      ? 'Citas'
      : entityQuotes.length === 1
        ? 'Cita'
        : `${entityQuotes.length} citas`

  return (
    <section>
      {/* θ1: header editorial en small-caps serif. Título + "+" a la misma
          altura; el "+" vive en la esquina derecha. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="section-eyebrow-serif">{title}</h3>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Añadir cita"
            title="Añadir cita"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-ink-100 text-ink-400 hover:border-ink-200 hover:bg-ink-50 hover:text-ink-700 transition-colors"
          >
            <PlusIcon size={13} />
          </button>
        )}
      </div>

      {adding && <QuickNoteForm entity={entity} onDone={() => setAdding(false)} />}

      {entityQuotes.length > 0 && (
        <ul className="space-y-5">
          {entityQuotes.map((quote) => {
            const linkedQuotes = quote.linkedQuoteIds
              .map((id) => quotes.find((q) => q.id === id))
              .filter((q): q is NonNullable<typeof q> => q !== undefined)
            return <QuoteCard key={quote.id} quote={quote} linkedQuotes={linkedQuotes} />
          })}
        </ul>
      )}
    </section>
  )
}
