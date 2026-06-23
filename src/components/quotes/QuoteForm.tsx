import { useState, type FormEvent } from 'react'
import type { Entity } from '../../types'
import { useAddQuote } from '../../state'
import { QuoteEchoesPanel } from './QuoteEchoesPanel'

/**
 * BB7: form "añadir cita" extraído de QuotesView (era ~50 LOC inline).
 *
 * Una cita siempre se atribuye a una entidad. Por eso el primer campo
 * es el select de entidad (entityId). Los demás son opcionales y se
 * pueden añadir editando después.
 *
 * El padre solo pasa la lista de entidades para llenar el select.
 * El form maneja su propio state + submit, sin filtrar nada arriba.
 *
 * U-2: tras crear la cita, mostramos el panel de Ecos (1-3 citas
 * similares por embedding) como marginalia debajo del form. Es
 * "esto te recordó a…" — sugerencias amables, no obligatorias. El
 * usuario puede dejarlo abierto o cerrarlo manualmente.
 */
export function QuoteForm({ entities }: { entities: Entity[] }) {
  const addQuote = useAddQuote()

  const [entityId, setEntityId] = useState('')
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [context, setContext] = useState('')
  const [userReflection, setUserReflection] = useState('')
  // U-2: ID de la cita recién creada, para fetch de Ecos.
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedText = text.trim()
    if (!trimmedText || !entityId) return
    try {
      const created = await addQuote.mutateAsync({
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
      // El ID nuevo dispara la fetch de Ecos en el panel. Si la cita
      // no tiene embedding (poco común), el panel renderiza null —
      // degrada silenciosamente.
      setLastCreatedId(created.id)
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
        aria-label="Atribución"
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
        aria-label="Cita"
      />
      <input
        type="text"
        value={source}
        onChange={(event) => setSource(event.target.value)}
        placeholder="Fuente (libro, página, año — opcional)"
        className="input-paper w-full"
        aria-label="Fuente"
      />
      <textarea
        value={context}
        onChange={(event) => setContext(event.target.value)}
        placeholder="Contexto de la cita (de qué habla, dónde aparece — opcional)"
        rows={2}
        className="input-paper w-full resize-none"
        aria-label="Contexto"
      />
      <textarea
        value={userReflection}
        onChange={(event) => setUserReflection(event.target.value)}
        placeholder="Tu reflexión propia (qué viste en esto, por qué la guardas — opcional)"
        rows={2}
        className="input-paper w-full resize-none"
        aria-label="Reflexión"
      />
      <button type="submit" disabled={addQuote.isPending} className="btn-accent">
        {addQuote.isPending ? 'Añadiendo…' : 'Añadir'}
      </button>
      {/* U-2: Ecos tras crear — marginalia debajo del form. */}
      <QuoteEchoesPanel
        quoteId={lastCreatedId}
        onDismiss={() => setLastCreatedId(null)}
      />
    </form>
  )
}
