import { useState, type FormEvent } from 'react'
import { useTrama } from '../state'

export function QuotesView() {
  const { entities, quotes, addQuote, deleteQuote } = useTrama()
  const [entityId, setEntityId] = useState('')
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [context, setContext] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedText = text.trim()
    if (!trimmedText || !entityId) return
    addQuote({
      entityId,
      text: trimmedText,
      source: source.trim() || undefined,
      context: context.trim() || undefined,
    })
    setText('')
    setSource('')
    setContext('')
  }

  if (entities.length === 0) {
    return (
      <p className="text-stone-500 italic leading-relaxed">
        Primero añade al menos una entidad en la pestaña{' '}
        <em className="text-stone-700">Entidades</em>. Las citas siempre van atadas a una
        persona, obra o concepto.
      </p>
    )
  }

  return (
    <>
      <section className="mb-12">
        <h2 className="text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
          Nueva cita
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors"
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
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors resize-none"
          />
          <input
            type="text"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="Fuente (libro, página, año — opcional)"
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors"
          />
          <textarea
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Tu nota o contexto (opcional)"
            rows={2}
            className="w-full px-3 py-2 bg-white border border-stone-200 rounded focus:outline-none focus:border-stone-400 transition-colors resize-none"
          />
          <button
            type="submit"
            className="px-5 py-2 bg-stone-800 text-stone-50 rounded hover:bg-stone-700 transition-colors text-sm"
          >
            Añadir cita
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.2em] text-stone-400 mb-4">
          {quotes.length === 0
            ? 'Aún sin citas'
            : `${quotes.length} ${quotes.length === 1 ? 'cita' : 'citas'}`}
        </h2>
        <ul className="space-y-8">
          {quotes.map((quote) => {
            const entity = entities.find((e) => e.id === quote.entityId)
            return (
              <li key={quote.id} className="group">
                <blockquote className="text-stone-700 leading-relaxed border-l-2 border-stone-300 pl-4 italic">
                  «{quote.text}»
                </blockquote>
                <div className="mt-2 pl-4 flex justify-between items-baseline gap-4">
                  <div className="text-sm">
                    <span className="text-stone-600">
                      — {entity?.name ?? 'entidad eliminada'}
                    </span>
                    {quote.source && (
                      <span className="text-stone-400 ml-2">· {quote.source}</span>
                    )}
                    {quote.origin === 'ai' && (
                      <span className="ml-2 text-[9px] uppercase tracking-[0.18em] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
                        ia
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => deleteQuote(quote.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-stone-700 text-xs"
                  >
                    eliminar
                  </button>
                </div>
                {quote.context && (
                  <p className="mt-2 pl-4 text-stone-500 text-sm leading-relaxed">
                    {quote.context}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </>
  )
}
