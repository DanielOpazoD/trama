import { useState, type FormEvent } from 'react'
import { useEntitiesQuery, useQuotesQuery, useAddQuote, useDeleteQuote } from '../state'

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
      <header className="mb-8 flex items-baseline justify-between">
        <h2 className="font-serif text-3xl text-ink-700">Citas</h2>
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
              className="mb-10 p-4 bg-paper-100/50 border border-ink-100 rounded-lg space-y-3"
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
            <ul className="space-y-8">
              {quotes.map((quote) => {
                const entity = entities.find((e) => e.id === quote.entityId)
                return (
                  <li key={quote.id} className="group">
                    <blockquote className="font-serif text-ink-600 italic leading-relaxed border-l-2 border-ink-200 pl-4">
                      «{quote.text}»
                    </blockquote>
                    <div className="mt-2 pl-4 flex justify-between items-baseline gap-4">
                      <div className="text-sm">
                        <span className="text-ink-500">
                          — {entity?.name ?? 'entidad eliminada'}
                        </span>
                        {quote.source && (
                          <span className="text-ink-300 ml-2">· {quote.source}</span>
                        )}
                        {quote.origin.kind === 'ai' && (
                          <span className="ml-2 text-[9px] uppercase tracking-[0.18em] text-sky-700/70">
                            ia
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
                      <p className="mt-1 pl-4 text-ink-400 text-sm leading-relaxed">
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
