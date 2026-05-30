import { useState, type ReactNode } from 'react'
import type { Task, TaskPatch } from '../../api'
import { CheckIcon, PencilIcon, TrashIcon } from '../Icons'

const ACCENT = 'var(--accent-sage)'

/** Resalta los #tags del texto conservando saltos de línea (igual que NoteCard). */
function renderWithTags(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(^|\s)#([\p{L}\p{N}_-]{1,40})/gu
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const hashAt = m.index + m[1]!.length
    if (hashAt > last) nodes.push(<span key={key++}>{text.slice(last, hashAt)}</span>)
    nodes.push(
      <span key={key++} className="font-medium" style={{ color: ACCENT }}>
        {'#' + m[2]}
      </span>,
    )
    last = hashAt + 1 + m[2]!.length
  }
  if (last < text.length) nodes.push(<span key={key++}>{text.slice(last)}</span>)
  return nodes
}

function todayLocal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** 'YYYY-MM-DD' → "12 jun" (en local, sin desfase de zona). */
function formatDue(due: string): string {
  const [y, m, d] = due.split('-').map(Number)
  if (!y || !m || !d) return due
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('es', { day: 'numeric', month: 'short' })
}

/** ISO de creación → "12 jun" (fecha local, sin hora). */
function formatCreated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

export function TaskItem({
  task,
  onToggle,
  onSave,
  onDelete,
  busy = false,
}: {
  task: Task
  onToggle: () => void
  onSave: (patch: TaskPatch) => void
  onDelete: () => void
  busy?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [detail, setDetail] = useState(task.detail ?? '')
  const [due, setDue] = useState(task.dueDate ?? '')

  function startEdit() {
    setTitle(task.title)
    setDetail(task.detail ?? '')
    setDue(task.dueDate ?? '')
    setEditing(true)
  }

  function save() {
    const t = title.trim()
    if (!t) return
    onSave({
      title: t,
      detail: detail.trim() || null,
      dueDate: due || null,
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <article className="card-paper-soft rounded-xl border border-ink-100/70 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título de la tarea"
          className="input-paper w-full text-ink-700 mb-2"
          autoFocus
        />
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Detalle (opcional) · usa #etiquetas"
          rows={2}
          className="input-paper w-full resize-none text-sm mb-2"
        />
        <div className="flex items-center justify-between gap-2">
          <label className="text-micro uppercase tracking-eyebrow text-ink-400 flex items-center gap-2">
            vence
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="input-paper text-sm normal-case tracking-normal"
            />
          </label>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(false)} className="btn-ghost text-xs">
              cancelar
            </button>
            <button
              onClick={save}
              disabled={!title.trim() || busy}
              className="btn-ink text-xs disabled:opacity-50"
            >
              guardar
            </button>
          </div>
        </div>
      </article>
    )
  }

  const overdue = !task.done && task.dueDate !== null && task.dueDate < todayLocal()

  return (
    <article className="card-paper-soft group rounded-xl border border-ink-100/70 p-4 transition-colors">
      <div className="flex items-start gap-3">
        {/* Checkbox de estado */}
        <button
          onClick={onToggle}
          disabled={busy}
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
          className={`mt-0.5 shrink-0 inline-flex items-center justify-center size-[18px] rounded-md border transition-colors disabled:opacity-50 ${
            task.done
              ? 'border-transparent text-paper-50'
              : 'border-ink-200 text-transparent hover:border-ink-400'
          }`}
          style={task.done ? { backgroundColor: ACCENT } : undefined}
        >
          <CheckIcon size={12} />
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`break-words leading-relaxed ${
              task.done ? 'text-ink-300 line-through' : 'text-ink-700'
            }`}
          >
            {renderWithTags(task.title)}
          </p>
          {task.detail && (
            <p
              className={`mt-1 text-sm whitespace-pre-wrap break-words leading-relaxed ${
                task.done ? 'text-ink-300' : 'text-ink-500'
              }`}
            >
              {renderWithTags(task.detail)}
            </p>
          )}
          <footer className="mt-2 flex items-center gap-3 text-micro">
            {/* Fecha de creación — siempre visible, clara. */}
            <span className="text-ink-300 tabular-nums" title="Fecha de creación">
              {formatCreated(task.createdAt)}
            </span>
            {/* Vencimiento — opcional; se resalta en rojo si está vencido. */}
            {task.dueDate && (
              <span
                className={`uppercase tracking-eyebrow tabular-nums ${
                  overdue ? 'text-red-700' : 'text-ink-400'
                }`}
              >
                {overdue ? 'venció' : 'vence'} {formatDue(task.dueDate)}
              </span>
            )}
            <span className="flex-1" />
            {/* Acciones — sutiles, visibles en hover (y siempre en touch). */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                onClick={startEdit}
                disabled={busy}
                aria-label="Editar tarea"
                title="Editar"
                className="p-1 text-ink-300 hover:text-ink-700 rounded transition-colors disabled:opacity-50"
              >
                <PencilIcon size={13} />
              </button>
              {confirming ? (
                <span className="flex items-center gap-2 pl-1">
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
                  aria-label="Borrar tarea"
                  title="Borrar"
                  className="p-1 text-ink-300 hover:text-red-700 rounded transition-colors"
                >
                  <TrashIcon size={13} />
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </article>
  )
}
