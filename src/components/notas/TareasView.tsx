import { useMemo, useState } from 'react'
import { useTasksQuery, useCreateTask, useUpdateTask, useDeleteTask } from '../../state'
import type { Task, TaskPriority } from '../../api'
import { LoadingHint } from '../LoadingHint'
import { PlusIcon } from '../Icons'
import { TaskItem } from './TaskItem'
import { PriorityDots } from './PriorityDots'
import { WeekPhotos } from './WeekPhotos'
import { MonthNavigator } from './MonthNavigator'
import { MonthNotes } from './MonthNotes'
import {
  weekStartLocal,
  formatWeekRangeLong,
  relativeWeekLabel,
  mondaysOfMonth,
  weekYearMonth,
  monthName,
} from './notasUtils'

/**
 * Trama Notas — sección Tareas. Arriba, un navegador por año y mes; al elegir
 * un mes se muestran TODAS sus semanas. Cada semana es un cuadro (una hoja
 * semanal) cuyo título es el rango de fechas; dentro, cada recordatorio es una
 * línea con su color de prioridad, un signo de hecho/pendiente y un icono de
 * detalle flotante. Cada semana puede sumar fotos. La búsqueda vive en el
 * buscador global del mundo Notas (arriba).
 */
export function TareasView() {
  const tasksQuery = useTasksQuery()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const now = new Date()
  const [navYear, setNavYear] = useState(now.getFullYear())
  const [navMonth, setNavMonth] = useState(now.getMonth())

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])
  const todayWeek = weekStartLocal()

  // Semana de una tarea, con red de seguridad: si por datos viejos faltara
  // `weekStart`, la derivamos de su fecha de creación (o la semana actual).
  function taskWeek(t: Task): string {
    if (t.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(t.weekStart)) return t.weekStart
    const d = t.createdAt ? new Date(t.createdAt) : new Date()
    return weekStartLocal(Number.isNaN(d.getTime()) ? new Date() : d)
  }

  const byWeek = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      // Arrastre: un pendiente de una semana anterior "pasa" a la semana actual
      // hasta que se complete (así no se pierde). Las hechas quedan en su semana.
      let wk = taskWeek(t)
      if (!t.done && wk < todayWeek) wk = todayWeek
      const arr = map.get(wk) ?? []
      arr.push(t)
      map.set(wk, arr)
    }
    return map
  }, [tasks, todayWeek])

  // Meses (del año mostrado) con algún pendiente — para el punto del navegador.
  const pendingMonths = useMemo(() => {
    const set = new Set<number>()
    for (const t of tasks) {
      if (t.done) continue
      let wk = taskWeek(t)
      if (wk < todayWeek) wk = todayWeek
      const { year, month0 } = weekYearMonth(wk)
      if (year === navYear) set.add(month0)
    }
    return set
  }, [tasks, navYear, todayWeek])

  const weekKeys = useMemo(() => mondaysOfMonth(navYear, navMonth), [navYear, navMonth])

  function addReminder(weekStart: string, title: string, priority: TaskPriority) {
    if (createTask.isPending) return
    createTask.mutate({ title, detail: null, dueDate: null, priority, weekStart })
  }

  const busy = updateTask.isPending || deleteTask.isPending

  function lines(items: Task[]) {
    const rank: Record<string, number> = { alta: 0, media: 1, baja: 2 }
    const pending = items
      .filter((t) => !t.done)
      .sort(
        (a, b) =>
          (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1) ||
          b.createdAt.localeCompare(a.createdAt),
      )
    const done = items
      .filter((t) => t.done)
      .sort((a, b) =>
        (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt),
      )
    return { pending, done }
  }

  function taskLine(task: Task) {
    return (
      <TaskItem
        key={task.id}
        task={task}
        busy={busy}
        onToggle={() => {
          const completing = !task.done
          // Al completar un pendiente arrastrado, lo fijamos en la semana actual
          // (queda registrado como hecho esta semana, no en su semana vieja).
          const patch =
            completing && taskWeek(task) < todayWeek
              ? { done: true, weekStart: todayWeek }
              : { done: !task.done }
          updateTask.mutate({ id: task.id, patch })
        }}
        onSave={(patch) => updateTask.mutate({ id: task.id, patch })}
        onDelete={() => deleteTask.mutate(task.id)}
      />
    )
  }

  function renderWeek(week: string) {
    const items = byWeek.get(week) ?? []
    const { pending, done } = lines(items)
    const isCurrent = week === todayWeek
    const rel = relativeWeekLabel(week)
    const titleLong = formatWeekRangeLong(week)

    return (
      <article
        key={week}
        className="card-paper-soft rounded-xl border border-ink-100/70 animate-fade-up"
        style={isCurrent ? { borderColor: 'var(--accent-sage)' } : undefined}
      >
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-1">
          <span className="min-w-0">
            {rel && <span className="section-eyebrow text-ink-400 block">{rel}</span>}
            <span className="font-serif text-lg text-ink-700 tracking-tight">
              {titleLong}
            </span>
          </span>
          <span className="shrink-0 text-micro uppercase tracking-eyebrow text-ink-300 tabular-nums">
            {pending.length > 0
              ? `${pending.length} pend.`
              : done.length > 0
                ? 'todo hecho'
                : ''}
          </span>
        </div>

        <div className="px-4 pb-3">
          {(pending.length > 0 || done.length > 0) && (
            <ul className="divide-y divide-ink-100/40">
              {pending.map(taskLine)}
              {done.length > 0 && (
                <li className="list-none pt-2 pb-0.5">
                  <span className="section-eyebrow text-ink-300">
                    hechas · {done.length}
                  </span>
                </li>
              )}
              {done.map(taskLine)}
            </ul>
          )}

          {/* Agregar — una línea dentro del cuadro de la semana. */}
          <div
            className={
              pending.length > 0 || done.length > 0
                ? 'border-t border-ink-100/50 mt-1'
                : ''
            }
          >
            <WeekComposer
              onAdd={(title, priority) => addReminder(week, title, priority)}
              pending={createTask.isPending}
            />
          </div>

          {/* Fotos de la semana */}
          <WeekPhotos weekStart={week} />
        </div>
      </article>
    )
  }

  const monthKey = `${navYear}-${String(navMonth + 1).padStart(2, '0')}`
  const monthLabel = `${monthName(navMonth)} ${navYear}`

  return (
    <>
      {/* Media página: navegador a la izquierda, notas del mes a la derecha. */}
      <div className="grid md:grid-cols-2 gap-4 mb-4 items-stretch">
        <MonthNavigator
          year={navYear}
          month0={navMonth}
          currentYear={now.getFullYear()}
          currentMonth0={now.getMonth()}
          pendingMonths={pendingMonths}
          onChange={(y, m) => {
            setNavYear(y)
            setNavMonth(m)
          }}
        />
        <MonthNotes key={monthKey} monthKey={monthKey} label={monthLabel} />
      </div>

      {tasksQuery.isLoading ? (
        <div className="py-10 flex justify-center">
          <LoadingHint text="cargando recordatorios" size="sm" />
        </div>
      ) : (
        <div className="space-y-4">{weekKeys.map(renderWeek)}</div>
      )}
    </>
  )
}

/** Composer de una semana: título + prioridad; Enter agrega. Estado local para
 *  que cada cuadro tenga su propio borrador sin pisarse con los demás. */
function WeekComposer({
  onAdd,
  pending,
}: {
  onAdd: (title: string, priority: TaskPriority) => void
  pending: boolean
}) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('media')

  function submit() {
    const t = title.trim()
    if (!t || pending) return
    onAdd(t, priority)
    setTitle('')
    setPriority('media')
  }

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <PlusIcon size={14} className="text-ink-300 shrink-0" />
      <PriorityDots value={priority} onChange={setPriority} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        placeholder="Agregar recordatorio…"
        className="flex-1 min-w-0 bg-transparent text-ink-700 placeholder:text-ink-300 py-0.5"
      />
      {title.trim() && (
        <button
          onClick={submit}
          disabled={pending}
          className="btn-ink text-xs disabled:opacity-40 shrink-0"
        >
          {pending ? '…' : 'Agregar'}
        </button>
      )}
    </div>
  )
}
