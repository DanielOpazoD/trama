import { useState, type FormEvent } from 'react'
import { useAddQuote } from '../../state'
import type { Entity } from '../../types'

/**
 * Form rápido para añadir una cita o nota atribuida a esta entidad.
 *
 * KISS: solo texto + reflexión opcional (oculta detrás de un "+ Reflexión").
 * No pide source/context (se editan después en QuoteCard si hace falta).
 * El objetivo es bajar la fricción al mínimo para capturar un pensamiento.
 */
export function QuickNoteForm({ entity }: { entity: Entity }) {
  const addQuote = useAddQuote()
  const [noteDraft, setNoteDraft] = useState('')
  const [reflectionDraft, setReflectionDraft] = useState('')
  const [showReflection, setShowReflection] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = noteDraft.trim()
    if (!text || addQuote.isPending) return
    try {
      await addQuote.mutateAsync({
        entityId: entity.id,
        text,
        userReflection: reflectionDraft.trim() || undefined,
        origin: { kind: 'manual' },
      })
      setNoteDraft('')
      setReflectionDraft('')
      setShowReflection(false)
    } catch {
      /* surfaces via addQuote.error */
    }
  }

  return (
    <section>
      {/* θ1: header en section-eyebrow-serif (small caps + Spectral) en
          vez del uppercase tracking-wider plano. Más refinado, hace
          que la sección se sienta como un epígrafe de capítulo. */}
      <h3 className="section-eyebrow-serif mb-2">Cita o nota</h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Una cita, una nota…"
          rows={2}
          className="input-paper w-full resize-none text-sm"
        />
        {showReflection ? (
          <textarea
            value={reflectionDraft}
            onChange={(e) => setReflectionDraft(e.target.value)}
            placeholder="Tu reflexión…"
            rows={2}
            className="input-paper w-full resize-none text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowReflection(true)}
            className="self-start text-xs uppercase tracking-wider text-ink-400 hover:text-ink-700 transition-colors"
          >
            + Reflexión
          </button>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!noteDraft.trim() || addQuote.isPending}
            className="btn-accent text-xs"
          >
            {addQuote.isPending ? 'añadiendo…' : 'añadir'}
          </button>
        </div>
      </form>
    </section>
  )
}
