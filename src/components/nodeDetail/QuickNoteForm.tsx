import { useState, type FormEvent } from 'react'
import { useAddQuote } from '../../state'
import type { Entity } from '../../types'

/**
 * Captura rápida de una cita o nota atribuida a esta entidad.
 *
 * Colapsada por defecto a un solo "+ cita o nota" — para no ocupar espacio
 * cuando no se está escribiendo. Al expandir: texto + reflexión opcional
 * (oculta tras "+ reflexión") + añadir. KISS: no pide source/context (se
 * editan luego en la cita si hace falta).
 */
export function QuickNoteForm({ entity }: { entity: Entity }) {
  const addQuote = useAddQuote()
  const [open, setOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [reflectionDraft, setReflectionDraft] = useState('')
  const [showReflection, setShowReflection] = useState(false)

  function reset() {
    setNoteDraft('')
    setReflectionDraft('')
    setShowReflection(false)
    setOpen(false)
  }

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
      reset()
    } catch {
      /* surfaces via addQuote.error */
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-ink-100 px-3 py-2 text-sm text-ink-400 hover:text-ink-700 hover:border-ink-200 transition-colors text-left"
      >
        + cita o nota
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        placeholder="Una cita, una nota…"
        rows={2}
        className="input-paper w-full resize-none text-sm"
        autoFocus
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
          className="self-start text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
        >
          + reflexión
        </button>
      )}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={reset} className="btn-ghost text-xs">
          cancelar
        </button>
        <button
          type="submit"
          disabled={!noteDraft.trim() || addQuote.isPending}
          className="btn-accent text-xs"
        >
          {addQuote.isPending ? 'añadiendo…' : 'añadir'}
        </button>
      </div>
    </form>
  )
}
