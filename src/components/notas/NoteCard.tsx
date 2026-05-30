import { useState } from 'react'
import type { Note } from '../../api'
import { renderMarkdown } from './markdown'
import { MomentosIcon } from '../Icons'

const ACCENT = 'var(--accent-sage)'

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function NoteCard({
  note,
  onTogglePin,
  onDelete,
  onPromote,
  onEdit,
  busy = false,
  promoting = false,
}: {
  note: Note
  onTogglePin: () => void
  onDelete: () => void
  onPromote: () => void
  onEdit: (content: string) => void
  busy?: boolean
  promoting?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note.content)
  const promoted = note.promotedMomentoId !== null

  function saveEdit() {
    const next = draft.trim()
    if (!next) return
    if (next !== note.content) onEdit(next)
    setEditing(false)
  }

  // Modo edición — textarea con el contenido en crudo (markdown), ⌘↵ guarda.
  if (editing) {
    return (
      <article className="card-paper-soft rounded-xl border border-ink-100/70 p-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              saveEdit()
            }
          }}
          rows={4}
          autoFocus
          className="w-full resize-y bg-transparent text-ink-700 placeholder:text-ink-300 focus:outline-none leading-relaxed"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button onClick={() => setEditing(false)} className="btn-ghost text-xs">
            cancelar
          </button>
          <button
            onClick={saveEdit}
            disabled={!draft.trim() || busy}
            className="btn-ink text-xs disabled:opacity-50"
          >
            guardar
          </button>
        </div>
      </article>
    )
  }

  return (
    <article className="card-paper-soft group rounded-xl border border-ink-100/70 p-4 transition-colors">
      <div className="break-words text-ink-700 leading-relaxed space-y-2">
        {renderMarkdown(note.content)}
      </div>
      <footer className="mt-3 flex items-center gap-3 text-micro">
        {note.pinned && (
          <span className="uppercase tracking-eyebrow" style={{ color: ACCENT }}>
            fijada
          </span>
        )}
        <span className="text-ink-300 tabular-nums">{formatDate(note.createdAt)}</span>
        {promoted && (
          <span
            className="inline-flex items-center gap-1 uppercase tracking-eyebrow"
            style={{ color: ACCENT }}
            title="Esta nota ya vive como Momento en tu trama"
          >
            <MomentosIcon size={11} />
            en momentos
          </span>
        )}
        <span className="flex-1" />
        {/* Acciones — sutiles, visibles en hover (y siempre en touch). */}
        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {!promoted && (
            <button
              onClick={onPromote}
              disabled={busy || promoting}
              title="Crear un Momento en tu trama a partir de esta nota"
              className="uppercase tracking-eyebrow text-ink-300 transition-colors disabled:opacity-50 hover:text-[color:var(--accent-sage)]"
            >
              {promoting ? 'promoviendo…' : '→ momento'}
            </button>
          )}
          <button
            onClick={() => {
              setDraft(note.content)
              setEditing(true)
            }}
            disabled={busy}
            className="uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
          >
            editar
          </button>
          <button
            onClick={onTogglePin}
            disabled={busy}
            className="uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
          >
            {note.pinned ? 'soltar' : 'fijar'}
          </button>
          {confirming ? (
            <span className="flex items-center gap-2">
              <button
                onClick={onDelete}
                disabled={busy}
                className="uppercase tracking-eyebrow text-red-700 hover:text-red-800 transition-colors disabled:opacity-50"
              >
                borrar
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
              >
                no
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="uppercase tracking-eyebrow text-ink-300 hover:text-red-700 transition-colors"
            >
              borrar
            </button>
          )}
        </div>
      </footer>
    </article>
  )
}
