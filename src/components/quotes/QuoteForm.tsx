import { useState, type FormEvent } from 'react'
import type { Entity } from '../../types'
import { useAddQuote } from '../../state'

/**
 * BB7: form "añadir cita" extraído de QuotesView (era ~50 LOC inline).
 *
 * Una cita siempre se atribuye a una entidad. Por eso el primer campo
 * es el select de entidad (entityId). Los demás son opcionales y se
 * pueden añadir editando después.
 *
 * El padre solo pasa la lista de entidades para llenar el select.
 * El form maneja su propio state + submit, sin filtrar nada arriba.
 */
export function QuoteForm({ entities }: { entities: Entity[] }) {
  const addQuote = useAddQuote()

  const [entityId, setEntityId] = useState('')
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [context, setContext] = useState('')
  const [userReflection, setUserReflection] = useState('')

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
      <button type="submit" disabled={addQuote.isPending} className="btn-accent">
        {addQuote.isPending ? 'Añadiendo…' : 'Añadir'}
      </button>
    </form>
  )
}
