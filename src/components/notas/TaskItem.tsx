import { useState, type ReactNode } from 'react'
import type { Task, TaskPatch, TaskPriority } from '../../api'
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileIcon,
  InfoIcon,
  PencilIcon,
  TrashIcon,
} from '../Icons'
import { PriorityDots, PRIORITY_META, PRIORITY_NEXT } from './PriorityDots'
import { formatWeekRange, relativeWeekLabel, shiftWeeks } from './notasUtils'

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

/** ISO de creación → "12 jun 2026, 14:30" (cuándo se generó por primera vez). */
function formatCreatedFull(iso: string): string {
  try {
    const d = new Date(iso)
    const fecha = d.toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    const hora = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    return `${fecha}, ${hora}`
  } catch {
    return iso
  }
}

/**
 * Una LÍNEA de recordatorio dentro del cuadro de la semana. No es una tarjeta:
 * es una viñeta compacta — checkbox de estado, un punto de color para la
 * prioridad (clic para ciclar alta → media → baja) y el texto con #etiquetas.
 * Si vino arrastrada de una semana anterior, lo marca tenue ("desde …"). El
 * detalle y la fecha de creación viven tras iconos sutiles (ventana flotante al
 * pasar el mouse en escritorio; un toque en táctil). Las acciones (posponer,
 * editar, borrar) se revelan al hover y quedan visibles en táctil.
 */
export function TaskItem({
  task,
  displayWeek,
  onToggle,
  onSave,
  onDelete,
  busy = false,
}: {
  task: Task
  /** Semana del cuadro donde se muestra (para "viene de antes" y posponer). */
  displayWeek: string
  onToggle: () => void
  onSave: (patch: TaskPatch) => void
  onDelete: () => void
  busy?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [detail, setDetail] = useState(task.detail ?? '')
  const [due, setDue] = useState(task.dueDate ?? '')
  const [showDue, setShowDue] = useState(Boolean(task.dueDate))
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [week, setWeek] = useState(task.weekStart)

  function startEdit() {
    setTitle(task.title)
    setDetail(task.detail ?? '')
    setDue(task.dueDate ?? '')
    setShowDue(Boolean(task.dueDate))
    setPriority(task.priority)
    setWeek(task.weekStart)
    setEditing(true)
  }

  function save() {
    const t = title.trim()
    if (!t) return
    onSave({
      title: t,
      detail: detail.trim() || null,
      dueDate: due || null,
      priority,
      weekStart: week,
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="list-none rounded-lg bg-paper-50 border border-ink-100/70 p-3 my-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            }
          }}
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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <PriorityDots value={priority} onChange={setPriority} disabled={busy} />
            {/* Mover de semana */}
            <span className="flex items-center gap-1 text-micro uppercase tracking-eyebrow text-ink-400">
              semana
              <button
                type="button"
                onClick={() => setWeek(shiftWeeks(week, -1))}
                aria-label="Semana anterior"
                className="p-0.5 rounded text-ink-300 hover:text-ink-700 transition-colors"
              >
                <ChevronLeftIcon size={13} />
              </button>
              <span className="normal-case tracking-normal text-ink-600 tabular-nums text-center min-w-[5.5rem]">
                {relativeWeekLabel(week) || formatWeekRange(week)}
              </span>
              <button
                type="button"
                onClick={() => setWeek(shiftWeeks(week, 1))}
                aria-label="Semana siguiente"
                className="p-0.5 rounded text-ink-300 hover:text-ink-700 transition-colors"
              >
                <ChevronRightIcon size={13} />
              </button>
            </span>
            {showDue ? (
              <span className="flex items-center gap-2">
                <label className="text-micro uppercase tracking-eyebrow text-ink-400 flex items-center gap-2">
                  vence
                  <input
                    type="date"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                    className="input-paper text-sm normal-case tracking-normal"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setDue('')
                    setShowDue(false)
                  }}
                  aria-label="Quitar fecha"
                  className="text-ink-300 hover:text-ink-700 transition-colors"
                >
                  ✕
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowDue(true)}
                className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
              >
                + fecha
              </button>
            )}
          </div>
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
      </li>
    )
  }

  const overdue = !task.done && task.dueDate !== null && task.dueDate < todayLocal()
  const meta = PRIORITY_META[task.priority]
  // ¿Vino arrastrada de una semana anterior a la que se muestra?
  const carriedFrom =
    !task.done && task.weekStart && task.weekStart < displayWeek ? task.weekStart : null

  return (
    <li className="group flex items-start gap-2.5 py-1.5">
      {/* Checkbox de estado — el signo de hecho/pendiente. */}
      <button
        onClick={onToggle}
        disabled={busy}
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        className={`mt-px shrink-0 inline-flex items-center justify-center size-[17px] rounded-md border transition-colors disabled:opacity-50 ${
          task.done
            ? 'border-transparent text-paper-50'
            : 'border-ink-200 text-transparent hover:border-ink-400'
        }`}
        style={task.done ? { backgroundColor: ACCENT } : undefined}
      >
        <CheckIcon size={11} className={task.done ? 'animate-check-pop' : undefined} />
      </button>

      {/* Punto de prioridad — el color es la marca; clic cicla alta→media→baja. */}
      <button
        onClick={() => onSave({ priority: PRIORITY_NEXT[task.priority] })}
        disabled={busy}
        aria-label={`Prioridad ${meta.label}, cambiar`}
        title={`Prioridad ${meta.label} · clic para cambiar`}
        className="mt-[5px] shrink-0 rounded-full transition-transform hover:scale-125 disabled:opacity-50"
      >
        <span
          aria-hidden
          className="block size-2.5 rounded-full"
          style={{ backgroundColor: meta.color, opacity: task.done ? 0.3 : 1 }}
        />
      </button>

      {/* Texto del recordatorio — clic para editar. */}
      <div className="min-w-0 flex-1">
        <p
          onClick={startEdit}
          className={`break-words leading-snug cursor-text ${
            task.done ? 'text-ink-300 line-through' : 'text-ink-700'
          }`}
        >
          {renderWithTags(task.title)}
        </p>
        {carriedFrom && (
          <span className="text-micro uppercase tracking-eyebrow text-ink-300">
            desde {formatDue(carriedFrom)}
          </span>
        )}
      </div>

      {/* Detalle — icono sutil; ventana flotante al pasar el mouse; clic para
          escribir o editar (en táctil, el toque abre la edición). */}
      <span
        className={`relative shrink-0 mt-px group/detail ${task.detail ? '' : 'hover-actions'}`}
      >
        <button
          onClick={startEdit}
          disabled={busy}
          aria-label={task.detail ? 'Ver o editar detalle' : 'Agregar detalle'}
          title={task.detail ? 'Detalle' : 'Agregar detalle'}
          className={`p-1 rounded transition-colors disabled:opacity-50 ${
            task.detail
              ? 'text-ink-400 hover:text-ink-700'
              : 'text-ink-300 hover:text-ink-700'
          }`}
        >
          <FileIcon size={13} />
        </button>
        {task.detail && (
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full mt-1 z-20 w-60 max-w-[15rem] rounded-lg border border-ink-100 bg-paper-50 p-2.5 text-sm text-ink-600 whitespace-pre-wrap break-words leading-snug text-left normal-case tracking-normal opacity-0 group-hover/detail:opacity-100 transition-opacity"
            style={{ boxShadow: 'var(--card-shadow-hover)' }}
          >
            {renderWithTags(task.detail)}
          </span>
        )}
      </span>

      {/* Información interna — icono "i"; al pasar el mouse o tocar, cuándo se creó. */}
      <span className="relative shrink-0 mt-px group/info">
        <button
          type="button"
          onClick={() => setInfoOpen((v) => !v)}
          aria-label={`Creado: ${formatCreatedFull(task.createdAt)}`}
          title={`Creado: ${formatCreatedFull(task.createdAt)}`}
          className="p-1 rounded text-ink-300 hover:text-ink-600 transition-colors"
        >
          <InfoIcon size={13} />
        </button>
        <span
          role="tooltip"
          className={`pointer-events-none absolute right-0 top-full mt-1 z-20 w-max max-w-[14rem] rounded-lg border border-ink-100 bg-paper-50 px-2.5 py-1.5 text-xs text-ink-500 normal-case tracking-normal transition-opacity group-hover/info:opacity-100 ${
            infoOpen ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ boxShadow: 'var(--card-shadow-hover)' }}
        >
          Creado: {formatCreatedFull(task.createdAt)}
        </span>
      </span>

      {/* Vencimiento — opcional y tenue; en rojo solo si está vencido. */}
      {task.dueDate && (
        <span
          className={`mt-0.5 shrink-0 text-micro uppercase tracking-eyebrow tabular-nums ${
            overdue ? 'text-[color:var(--accent-clay)]' : 'text-ink-300'
          }`}
        >
          {overdue ? 'venció' : 'vence'} {formatDue(task.dueDate)}
        </span>
      )}

      {/* Acciones — reveladas al hover en escritorio, visibles en táctil. */}
      <div className="mt-px shrink-0 flex items-center gap-1 hover-actions">
        {!task.done && (
          <button
            onClick={() => onSave({ weekStart: shiftWeeks(displayWeek, 1) })}
            disabled={busy}
            aria-label="Posponer a la próxima semana"
            title="Posponer a la próxima semana"
            className="p-1 text-ink-300 hover:text-ink-700 rounded transition-colors disabled:opacity-50"
          >
            <ArrowRightIcon size={13} />
          </button>
        )}
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
              className="text-micro uppercase tracking-eyebrow text-[color:var(--accent-clay)] transition-colors disabled:opacity-50"
            >
              borrar
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
            >
              no
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            aria-label="Borrar tarea"
            title="Borrar"
            className="p-1 text-ink-300 hover:text-[color:var(--accent-clay)] rounded transition-colors"
          >
            <TrashIcon size={13} />
          </button>
        )}
      </div>
    </li>
  )
}
