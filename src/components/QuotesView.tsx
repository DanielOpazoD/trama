import { useState, type FormEvent } from 'react'
import { useEntitiesQuery, useQuotesQuery, useAddQuote, useDeleteQuote } from '../state'
import { SparkleIcon } from './Icons'
import { EmptyMessage } from './EmptyMessage'

/** Format an ISO date as "20 may 2026" — short, ink-on-paper style. */
function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).replace(/\./g, '')
  } catch {
    return ''
  }
}

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

export function QuotesView({
  onSelectEntity,
}: {
  onSelectEntity?: (id: string) => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const addQuote = useAddQuote()
  const deleteQuote = useDeleteQuote()

  const [entityId, setEntityId] = useState('')
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [context, setContext] = useState('')
  const [userReflection, setUserReflection] = useState('')
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
        userReflection: userReflection.trim() || undefined,
      })
      setText('')
      setSource('')
      setContext('')
      setUserReflection('')
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
        <EmptyMessage
          title="No hay todavía a quién atribuir nada."
          body={
            <>
              Las citas viven pegadas a una entidad: una persona, un libro,
              una canción. Crea la primera entidad y vuelve.
            </>
          }
          hint="Pega un texto en la barra de abajo o entra a Entidades para empezar."
        />
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
                placeholder="Contexto de la cita (de qué habla, dónde aparece — opcional)"
                rows={2}
                className="input-paper w-full resize-none"
              />
              <textarea
                value={userReflection}
                onChange={(event) => setUserReflection(event.target.value)}
                placeholder="Tu reflexión propia (qué viste en esto, por qué la guardas — opcional)"
                rows={2}
                className="input-paper w-full resize-none"
              />
              <button type="submit" disabled={addQuote.isPending} className="btn-ink">
                {addQuote.isPending ? 'añadiendo…' : 'Añadir cita'}
              </button>
            </form>
          )}

          {quotes.length === 0 ? (
            <EmptyMessage
              title="Una página todavía en blanco."
              body={
                <>
                  Las citas son piezas que se quedan: una frase que te detuvo,
                  un verso que volvió. Cuando guardes la primera, su tipografía
                  va a verse mejor que esto.
                </>
              }
              hint="Pega texto abajo o usa el botón de cámara para empezar."
            />
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
                        {entity ? (
                          <button
                            onClick={() => onSelectEntity?.(entity.id)}
                            className="text-ink-500 hover:text-ink-700 transition-colors border-b border-transparent hover:border-ink-300"
                          >
                            — {entity.name}
                          </button>
                        ) : (
                          <span className="text-ink-300">— entidad eliminada</span>
                        )}
                        {quote.source && (
                          <span className="text-ink-300 ml-2 italic">· {quote.source}</span>
                        )}
                        {quote.origin.kind === 'ai' && (
                          <span className="ml-1.5 inline-flex items-center text-sky-700/70" title="propuesta por IA">
                            <SparkleIcon size={10} />
                          </span>
                        )}
                        <span
                          className="ml-3 text-[11px] text-ink-300 tabular-nums"
                          title={`Añadida el ${new Date(quote.createdAt).toLocaleString('es')}`}
                        >
                          añadida {formatDate(quote.createdAt)}
                        </span>
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
                    {quote.userReflection && (
                      <div className={`mt-3 ${isFeature ? '' : 'pl-5'}`}>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-ink-400 mb-1">
                          tu reflexión
                        </div>
                        <p className="text-ink-600 text-sm leading-relaxed whitespace-pre-wrap">
                          {quote.userReflection}
                        </p>
                      </div>
                    )}
                    {quote.aiReflection && (
                      <div className={`mt-3 ${isFeature ? '' : 'pl-5'}`}>
                        <div className="flex items-baseline gap-1.5 text-[10px] uppercase tracking-[0.2em] text-sky-700/80 mb-1">
                          <SparkleIcon size={10} />
                          interpretación de la IA
                        </div>
                        <p className="text-ink-500 text-sm leading-relaxed whitespace-pre-wrap">
                          {quote.aiReflection}
                        </p>
                      </div>
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
