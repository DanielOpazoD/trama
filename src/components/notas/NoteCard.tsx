import { useState } from 'react'
import type { Note } from '../../api'
import { renderMarkdown } from './markdown'

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
  busy = false,
}: {
  note: Note
  onTogglePin: () => void
  onDelete: () => void
  busy?: boolean
}) {
  const [confirming, setConfirming] = useState(false)

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
        <span className="flex-1" />
        {/* Acciones — sutiles, visibles en hover (y siempre en touch). */}
        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
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
