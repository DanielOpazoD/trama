import { useState } from 'react'
import type { Entity, Quote } from '../../types'

/**
 * Modo "editar cita completa" del QuoteCard. Vivía inline en
 * `QuoteCard.tsx` como una rama de ~62 LOC que dominaba el código
 * cuando estaba activa.
 *
 * Edita los 4 campos principales de la cita:
 *   - text (textarea serif italic, requerido)
 *   - source (input, opcional)
 *   - context (textarea, opcional)
 *   - entityId (select — permite mover la cita a otra entidad, útil
 *     cuando un extract IA atribuyó al libro y el usuario quiere
 *     ponerlo en el autor)
 *
 * El padre llama `onSave(patch)` con solo los campos que cambiaron;
 * el cierre se controla con `onCancel`. State local muere al desmontar.
 */
export function QuoteEditMode({
  quote,
  entities,
  pending,
  onCancel,
  onSave,
}: {
  quote: Quote
  entities: Entity[]
  pending: boolean
  onCancel: () => void
  onSave: (patch: {
    text: string
    source: string | null
    context: string | null
    entityId?: string
  }) => Promise<void> | void
}) {
  const [textDraft, setTextDraft] = useState(quote.text)
  const [sourceDraft, setSourceDraft] = useState(quote.source ?? '')
  const [contextDraft, setContextDraft] = useState(quote.context ?? '')
  const [entityIdDraft, setEntityIdDraft] = useState(quote.entityId)

  async function handleSave() {
    const text = textDraft.trim()
    if (!text) return
    const patch: Parameters<typeof onSave>[0] = {
      text,
      source: sourceDraft.trim() || null,
      context: contextDraft.trim() || null,
    }
    if (entityIdDraft !== quote.entityId) {
      patch.entityId = entityIdDraft
    }
    await onSave(patch)
  }

  return (
    <li className="group border-l-2 border-ink-200/70 pl-3 space-y-2">
      <div className="text-micro uppercase tracking-eyebrow text-ink-300">
        editar cita
      </div>
      <textarea
        value={textDraft}
        onChange={(e) => setTextDraft(e.target.value)}
        rows={3}
        placeholder="texto de la cita"
        className="input-paper w-full resize-none text-sm font-serif italic"
      />
      <input
        type="text"
        value={sourceDraft}
        onChange={(e) => setSourceDraft(e.target.value)}
        placeholder="fuente (libro, página, año — opcional)"
        className="input-paper w-full text-sm"
      />
      <textarea
        value={contextDraft}
        onChange={(e) => setContextDraft(e.target.value)}
        rows={2}
        placeholder="contexto (qué pasaba alrededor — opcional)"
        className="input-paper w-full resize-none text-sm"
      />
      <div>
        <label className="section-eyebrow block mb-1">atribuida a</label>
        <select
          value={entityIdDraft}
          onChange={(e) => setEntityIdDraft(e.target.value)}
          className="input-paper w-full text-sm"
        >
          {entities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.type ? ` · ${e.type}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost text-xs" disabled={pending}>
          cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={pending || !textDraft.trim()}
          className="btn-accent text-xs"
        >
          {pending ? 'guardando…' : 'guardar'}
        </button>
      </div>
    </li>
  )
}
