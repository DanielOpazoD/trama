import { useState, type FormEvent } from 'react'
import { useAddQuote } from '../../state'
import type { Entity } from '../../types'

/**
 * Formulario de captura rápida de una cita atribuida a esta entidad.
 *
 * Se monta cuando el usuario toca el "+" del encabezado de Citas y avisa con
 * `onDone` al añadir o cancelar. Texto + reflexión opcional (oculta tras
 * "+ reflexión"). KISS: no pide source/context (se editan luego en la cita
 * si hace falta).
 */
export function QuickNoteForm({
  entity,
  onDone,
}: {
  entity: Entity
  onDone: () => void
}) {
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
      onDone()
    } catch {
      /* surfaces via addQuote.error */
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-3 flex flex-col gap-2">
      <textarea
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        placeholder="Una cita…"
        rows={2}
        className="input-paper w-full resize-none text-body"
        autoFocus
        aria-label="Cita"
      />
      {showReflection ? (
        <textarea
          value={reflectionDraft}
          onChange={(e) => setReflectionDraft(e.target.value)}
          placeholder="Tu reflexión…"
          rows={2}
          className="input-paper w-full resize-none text-body"
          aria-label="Reflexión"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowReflection(true)}
          className="self-start text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
        >
          + reflexión
        </button>
      )}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-ghost text-caption">
          cancelar
        </button>
        <button
          type="submit"
          disabled={!noteDraft.trim() || addQuote.isPending}
          className="btn-accent text-caption"
        >
          {addQuote.isPending ? 'añadiendo…' : 'añadir'}
        </button>
      </div>
    </form>
  )
}
