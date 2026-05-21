import { useState, type FormEvent } from 'react'
import { useEntitiesQuery, useQuotesQuery, useAddQuote, useDeleteQuote } from '../state'
import { SparkleIcon } from './Icons'

/** Drop-cap on the first letter of a quote — adds editorial weight. */
function withDropCap(text: string) {
  if (!text) return null
  const first = text[0]
  const rest = text.slice(1)
  return (
    <>
      <span className="float-left mr-2 mt-1 text-6xl leading-[0.85] font-serif text-ink-700 select-none">
        {first}
      </span>
      {rest}
    </>
  )
}

export function QuotesView() {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const addQuote = useAddQuote()
  const deleteQuote = useDeleteQuote()

  const [entityId, setEntityId] = useState('')
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [context, setContext] = useState('')
  const [showForm, setShowForm] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedText = text.trim()
    if (!trimmedText || !entityId) return
    try {
      await addQuote.mutateAsync({
        entityId,
        text: trimmedText,
        source: source.trim() || undefined,
        context: context.trim() || undefined,
      })
      setText('')
      setSource('')
      setContext('')
    } catch {
      /* error surfaces via addQuote.error */
    }
  }

  return (
    <>
      <header className="mb-10 flex items-baseline justify-between gap-6">
        <div className="min-w-0">
          <h2 className="font-serif text-4xl text-ink-700 leading-none">Citas</h2>
          <p className="mt-2 text-sm text-ink-400 leading-relaxed max-w-md">
            Fragmentos textuales que atribuyes a una entidad. Una frase de un libro,
            algo que dijo una persona, un verso de una canción.
          </p>
        </div>
        {entities.length > 0 && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="text-xs uppercase tracking-[0.18em] text-ink-300 hover:text-ink-700 transition-colors"
          >
            {showForm ? 'cerrar' : 'añadir manualmente'}
          </button>
        )}
      </header>

      {entities.length === 0 ? (
        <p className="text-ink-400 italic leading-relaxed">
          Las citas se atan a entidades. Primero crea al menos una entidad — pegando
          un texto en la barra de abajo o desde la pestaña <em>Entidades</em>.
        </p>
      ) : (
        <>
          {showForm && (
            <form
              onSubmit={handleSubmit}
              className="mb-12 p-4 bg-paper-100/50 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
            >
              <select
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
                className="input-paper w-full"
              >
                <option value="">— elige a quién pertenece —</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="La cita"
                rows={4}
                className="input-paper w-full resize-none"
              />
              <input
                type="text"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Fuente (libro, página, año — opcional)"
                className="input-paper w-full"
              />
              <textarea
                value={context}
                onChange={(event) => setContext(event.target.value)}
                placeholder="Tu nota o contexto (opcional)"
                rows={2}
                className="input-paper w-full resize-none"
              />
              <button type="submit" disabled={addQuote.isPending} className="btn-ink">
                {addQuote.isPending ? 'añadiendo…' : 'Añadir cita'}
              </button>
            </form>
          )}

          {quotes.length === 0 ? (
            <p className="text-ink-400 italic leading-relaxed">Aún sin citas.</p>
          ) : (
            <ul className="space-y-14">
              {quotes.map((quote, index) => {
                const entity = entities.find((e) => e.id === quote.entityId)
                // First quote gets the editorial drop-cap treatment;
                // others get a slightly smaller, still elegant block.
                const isFeature = index === 0
                return (
                  <li
                    key={quote.id}
                    className="group animate-fade-up"
                    style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
                  >
                    {isFeature ? (
                      <blockquote className="quote-block text-2xl md:text-3xl text-ink-700 leading-snug clear-both overflow-hidden">
                        {withDropCap(quote.text)}
                      </blockquote>
                    ) : (
                      <blockquote className="quote-block text-lg md:text-xl text-ink-600 leading-relaxed border-l-2 border-ink-200 pl-5">
                        «{quote.text}»
                      </blockquote>
                    )}
                    <div
                      className={`mt-3 flex justify-between items-baseline gap-4 ${
                        isFeature ? '' : 'pl-5'
                      }`}
                    >
                      <div className="text-sm">
                        <span className="text-ink-500">
                          — {entity?.name ?? 'entidad eliminada'}
                        </span>
                        {quote.source && (
                          <span className="text-ink-300 ml-2 italic">· {quote.source}</span>
                        )}
                        {quote.origin.kind === 'ai' && (
                          <span className="ml-1.5 inline-flex items-center text-sky-700/70" title="propuesta por IA">
                            <SparkleIcon size={10} />
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteQuote.mutate(quote.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-300 hover:text-ink-700 text-xs"
                      >
                        eliminar
                      </button>
                    </div>
                    {quote.context && (
                      <p
                        className={`mt-2 text-ink-400 text-sm leading-relaxed italic ${
                          isFeature ? '' : 'pl-5'
                        }`}
                      >
                        {quote.context}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </>
  )
}
