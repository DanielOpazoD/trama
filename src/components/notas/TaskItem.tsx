import { useEffect, useState, type ReactNode } from 'react'
import type { Task, TaskPatch, TaskPriority } from '../../api'
import {
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileIcon,
  InfoIcon,
  PencilIcon,
  TrashIcon,
} from '../Icons'
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu'
import { AttachmentPhotos } from './AttachmentPhotos'
import { PriorityDots, PriorityMenu } from './PriorityDots'
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
 * Una LÍNEA de recordatorio dentro del cuadro de la semana. En reposo muestra lo
 * esencial — estado, color de prioridad y texto — más, si los tiene, una marca
 * de "viene de antes" (arrastre) y el vencimiento. El resto de gestos (editar,
 * posponer, ver cuándo se creó, borrar) se consolidan en un menú "⋯", para no
 * saturar la fila y ser usable en táctil. El detalle vive tras un icono con
 * ventana flotante (hover en escritorio; toque en táctil; Escape la cierra).
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
  const [detailOpen, setDetailOpen] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [detail, setDetail] = useState(task.detail ?? '')
  const [due, setDue] = useState(task.dueDate ?? '')
  const [showDue, setShowDue] = useState(Boolean(task.dueDate))
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [week, setWeek] = useState(task.weekStart)

  // El popover de detalle se cierra con Escape (además del hover y el toque).
  useEffect(() => {
    if (!detailOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDetailOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [detailOpen])

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
            } else if (e.key === 'Escape') {
              setEditing(false)
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
        {/* Fotos de esta tarea */}
        <div className="mb-2">
          <span className="section-eyebrow text-ink-300 block mb-1">
            fotos de la tarea
          </span>
          <AttachmentPhotos ownerType="task" ownerId={task.id} title={task.title} />
        </div>
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
                className="touch-target p-0.5 rounded text-ink-300 hover:text-ink-700 transition-colors"
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
                className="touch-target p-0.5 rounded text-ink-300 hover:text-ink-700 transition-colors"
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
  // ¿Vino arrastrada de una semana anterior a la que se muestra?
  const carriedFrom =
    !task.done && task.weekStart && task.weekStart < displayWeek ? task.weekStart : null

  return (
    <li className="group flex items-start gap-2.5 py-1.5">
      {/* Estado — el signo de hecho/pendiente. */}
      <button
        onClick={onToggle}
        disabled={busy}
        role="checkbox"
        aria-checked={task.done}
        aria-label={task.done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        className={`touch-target mt-px shrink-0 inline-flex items-center justify-center size-[17px] rounded-md border transition-colors disabled:opacity-50 ${
          task.done
            ? 'border-transparent text-paper-50'
            : 'border-ink-200 text-transparent hover:border-ink-400'
        }`}
        style={task.done ? { backgroundColor: ACCENT } : undefined}
      >
        <CheckIcon size={11} className={task.done ? 'animate-check-pop' : undefined} />
      </button>

      {/* Prioridad — el color es la marca; menú para elegir alta/media/baja. */}
      <span className="mt-[3px] shrink-0">
        <PriorityMenu value={task.priority} onChange={(p) => onSave({ priority: p })} />
      </span>

      {/* Texto — doble clic para editar (deja libre el clic simple para seleccionar). */}
      <div className="min-w-0 flex-1">
        <p
          onDoubleClick={startEdit}
          className={`break-words leading-snug ${
            task.done ? 'text-ink-300 line-through' : 'text-ink-700'
          }`}
        >
          {renderWithTags(task.title)}
        </p>
        {carriedFrom && (
          <span className="inline-flex items-center gap-0.5 text-micro text-ink-300 mt-0.5">
            <ArrowRightIcon size={9} />
            desde {formatDue(carriedFrom)}
          </span>
        )}
      </div>

      {/* Marca distintiva: la tarea guarda fotos adjuntas. */}
      {task.hasPhotos && (
        <span
          className="shrink-0 mt-1 inline-flex items-center text-ink-300"
          title="Tiene fotos adjuntas"
          aria-label="Tiene fotos adjuntas"
        >
          <CameraIcon size={13} />
        </span>
      )}

      {/* Detalle — icono sutil; ventana flotante al pasar el mouse o tocar. */}
      {task.detail && (
        <span className="relative shrink-0 mt-px group/detail">
          <button
            type="button"
            onClick={() => setDetailOpen((v) => !v)}
            aria-label="Ver detalle"
            aria-expanded={detailOpen}
            title="Detalle"
            className="touch-target p-1 rounded text-ink-400 hover:text-ink-700 transition-colors"
          >
            <FileIcon size={13} />
          </button>
          <span
            role="tooltip"
            className={`pointer-events-none absolute right-0 top-full mt-1 z-20 w-60 max-w-[15rem] rounded-lg border border-ink-100 bg-paper-50 p-2.5 text-sm text-ink-600 whitespace-pre-wrap break-words leading-snug text-left normal-case tracking-normal transition-opacity group-hover/detail:opacity-100 ${
              detailOpen ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ boxShadow: 'var(--card-shadow-hover)' }}
          >
            {renderWithTags(task.detail)}
          </span>
        </span>
      )}

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

      {/* Acciones secundarias consolidadas — editar, posponer, info, borrar. */}
      <div className="mt-px shrink-0">
        <OverflowMenu
          label="Acciones del recordatorio"
          triggerClassName="touch-target p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
          width="w-56"
        >
          {(close) => (
            <>
              <OverflowMenuItem
                onClick={() => {
                  startEdit()
                  close()
                }}
                disabled={busy}
              >
                <PencilIcon size={13} /> Editar
              </OverflowMenuItem>
              {!task.done && (
                <OverflowMenuItem
                  onClick={() => {
                    onSave({ weekStart: shiftWeeks(displayWeek, 1) })
                    close()
                  }}
                  disabled={busy}
                >
                  <ArrowRightIcon size={13} /> Posponer una semana
                </OverflowMenuItem>
              )}
              <p className="flex items-center gap-2 px-2.5 pt-2 pb-1 mt-1 border-t border-ink-100/60 text-micro text-ink-300">
                <InfoIcon size={12} /> Creado: {formatCreatedFull(task.createdAt)}
              </p>
              <OverflowMenuItem
                danger
                onClick={() => {
                  onDelete()
                  close()
                }}
                disabled={busy}
              >
                <TrashIcon size={13} /> Borrar
              </OverflowMenuItem>
            </>
          )}
        </OverflowMenu>
      </div>
    </li>
  )
}
