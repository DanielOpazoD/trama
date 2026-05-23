import { useEffect, useState } from 'react'
import { useUpdateEntity } from '../../state'
import type { Entity } from '../../types'

/**
 * Editor del "ensayo" — una nota larga en formato libre que vive en
 * `entity.essay`. Pensado para reflexiones más profundas que una cita,
 * con texto multi-párrafo y formato serif para lectura cómoda.
 *
 * Tres estados:
 *   1. Sin ensayo → botón "+ Ensayo" para empezar uno.
 *   2. Con ensayo → renderiza el texto + un "editar" que aparece al hover.
 *   3. Editando → textarea grande + botones guardar/cancelar.
 */
export function EssayEditor({ entity }: { entity: Entity }) {
  const updateEntity = useUpdateEntity()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entity.essay ?? '')

  useEffect(() => {
    setDraft(entity.essay ?? '')
  }, [entity.id, entity.essay])

  async function handleSave() {
    const next = draft.trim() || null
    if ((entity.essay ?? null) === next) {
      setEditing(false)
      return
    }
    try {
      await updateEntity.mutateAsync({ id: entity.id, patch: { essay: next } })
      setEditing(false)
    } catch {
      /* surfaces */
    }
  }

  if (editing) {
    return (
      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-ink-400">ensayo</h3>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Nota larga sobre esto…"
          rows={8}
          className="input-paper w-full resize-none text-sm leading-relaxed"
          autoFocus
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setEditing(false)
              setDraft(entity.essay ?? '')
            }}
            className="btn-ghost text-xs"
          >
            cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={updateEntity.isPending}
            className="btn-ink text-xs"
          >
            {updateEntity.isPending ? 'guardando…' : 'guardar ensayo'}
          </button>
        </div>
      </section>
    )
  }

  if (entity.essay) {
    return (
      <section className="group/essay">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-xs uppercase tracking-wider text-ink-400">ensayo</span>
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover/essay:opacity-100 transition-opacity text-xs text-ink-400 hover:text-ink-700"
          >
            editar
          </button>
        </div>
        <div className="text-ink-700 text-sm leading-relaxed whitespace-pre-wrap font-serif">
          {entity.essay}
        </div>
      </section>
    )
  }

  return (
    <section>
      <button
        onClick={() => setEditing(true)}
        className="text-xs uppercase tracking-wider text-ink-400 hover:text-ink-700 transition-colors"
      >
        + Ensayo
      </button>
    </section>
  )
}
