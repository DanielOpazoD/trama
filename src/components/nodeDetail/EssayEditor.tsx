import { useEffect, useState } from 'react'
import { useUpdateEntity } from '../../state'
import type { Entity } from '../../types'
import { ReadingModeEssay } from '../ReadingModeEssay'
import { PencilIcon, ReadingIcon } from '../Icons'

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
  // δ4: reading mode — open full-screen serif modal. Solo aplica cuando
  // hay essay; ver ReadingModeEssay para los detalles tipográficos.
  const [readingOpen, setReadingOpen] = useState(false)

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
      <>
        <section className="group/essay">
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-xs uppercase tracking-wider text-ink-400">ensayo</span>
            {/* δ4: dos affordances al hover — "leer" abre modo lectura
                full-screen (tipografía generosa para texto largo), "editar"
                entra al editor inline. El doble click sobre el cuerpo sigue
                yendo a editar (era el atajo de B1). */}
            <button
              onClick={() => setReadingOpen(true)}
              className="opacity-0 group-hover/essay:opacity-100 transition-opacity text-ink-400 hover:text-ink-700 inline-flex"
              aria-label="Leer"
              title="Abrir en modo lectura (serif, columna ancha)"
            >
              <ReadingIcon size={13} />
            </button>
            <button
              onClick={() => setEditing(true)}
              className="opacity-0 group-hover/essay:opacity-100 transition-opacity text-ink-400 hover:text-ink-700 inline-flex"
              aria-label="Editar"
              title="Editar ensayo"
            >
              <PencilIcon size={13} />
            </button>
          </div>
          {/* Doble-click sobre el ensayo entra a edit. */}
          <div
            onDoubleClick={() => setEditing(true)}
            className="text-ink-700 text-sm leading-relaxed whitespace-pre-wrap font-serif cursor-text select-text"
            title="Doble click para editar · botón 'leer' para modo lectura"
          >
            {entity.essay}
          </div>
        </section>
        <ReadingModeEssay
          title={entity.name}
          body={entity.essay}
          open={readingOpen}
          onClose={() => setReadingOpen(false)}
        />
      </>
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
