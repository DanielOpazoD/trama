import { useMemo, useState } from 'react'
import {
  useTasksRange,
  usePendingTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from '../../state'
import type { Task, TaskPriority, TaskCategory } from '../../api'
import { LoadingHint } from '../LoadingHint'
import { ErrorState } from '../ErrorState'
import { ViewHeader } from '../ViewHeader'
import { PlusIcon, CameraIcon, SortIcon } from '../Icons'
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu'
import { TaskItem } from './TaskItem'
import { PriorityDots } from './PriorityDots'
import { AttachmentPhotos } from './AttachmentPhotos'
import { MonthNavigator } from './MonthNavigator'
import { MonthNotes } from './MonthNotes'
import {
  weekStartLocal,
  formatWeekRangeLong,
  relativeWeekLabel,
  mondaysOfMonth,
  monthName,
} from './notasUtils'
import {
  groupTasksByWeek,
  splitByStatus,
  pendingMonthsForYear,
  rawTaskWeek,
  filterByCategory,
  countPendingByCategory,
  DEFAULT_CATEGORY,
  type SortMode,
} from './weekModel'

const ACCENT = 'var(--accent-sage)'

const SORT_LABELS: Record<SortMode, string> = {
  priority: 'Prioridad',
  created: 'Fecha de ingreso',
  tag: 'Etiqueta',
}

/** Pestañas clasificatorias de cada cuadro semanal. */
const CATEGORY_TABS: { key: TaskCategory; label: string }[] = [
  { key: 'trabajo', label: 'Trabajo' },
  { key: 'personal', label: 'Personal' },
]

/**
 * Trama Notas — sección Tareas. Arriba, un navegador por año y mes; al elegir
 * un mes se muestran TODAS sus semanas. Cada semana es un cuadro (una hoja
 * semanal) cuyo título es el rango de fechas; dentro, cada recordatorio es una
 * línea con su color de prioridad, signo de hecho y un icono de detalle. Los
 * pendientes no completados se arrastran a la semana actual.
 *
 * Datos: la lista se carga ACOTADA al mes visible (`useTasksRange`, + arrastre);
 * los pendientes globales (livianos) alimentan los puntos del navegador. La
 * lógica de "semana" vive en `weekModel`.
 */
export function TareasView() {
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const now = new Date()
  const [navYear, setNavYear] = useState(now.getFullYear())
  const [navMonth, setNavMonth] = useState(now.getMonth())
  // Por defecto, fecha de ingreso: así cambiar la prioridad de una tarea no la
  // reordena en el acto (con orden por prioridad sí saltaría de lugar).
  const [sortMode, setSortMode] = useState<SortMode>('created')
  // Semanas con la tira de fotos abierta — la actual abre por defecto; las
  // demás cargan al tocar el icono (carga perezosa).
  const [photosOpen, setPhotosOpen] = useState<Set<string>>(
    () => new Set([weekStartLocal()]),
  )
  function togglePhotos(week: string) {
    setPhotosOpen((prev) => {
      const next = new Set(prev)
      if (next.has(week)) next.delete(week)
      else next.add(week)
      return next
    })
  }
  // Pestaña activa (Trabajo/Personal) por cuadro semanal. Cada hoja recuerda la
  // suya; por defecto 'trabajo' (donde quedan también las tareas antiguas).
  const [weekCategory, setWeekCategory] = useState<Record<string, TaskCategory>>({})
  function categoryFor(week: string): TaskCategory {
    return weekCategory[week] ?? DEFAULT_CATEGORY
  }
  function setCategory(week: string, cat: TaskCategory) {
    setWeekCategory((prev) => ({ ...prev, [week]: cat }))
  }

  const todayWeek = weekStartLocal()
  const weekKeys = useMemo(() => mondaysOfMonth(navYear, navMonth), [navYear, navMonth])
  const orderedWeekKeys = useMemo(() => {
    if (!weekKeys.includes(todayWeek)) return weekKeys
    return [todayWeek, ...weekKeys.filter((week) => week !== todayWeek)]
  }, [todayWeek, weekKeys])
  const isCurrentMonth = navYear === now.getFullYear() && navMonth === now.getMonth()
  const weekFrom = weekKeys[0] ?? todayWeek
  const weekTo = weekKeys[weekKeys.length - 1] ?? todayWeek
  // En el mes en curso traemos también los pendientes anteriores (se arrastran
  // a la semana actual); en otros meses no hace falta.
  const carryBefore = isCurrentMonth ? todayWeek : null

  const rangeQuery = useTasksRange({ weekFrom, weekTo, carryBefore })
  const tasks = useMemo(() => rangeQuery.data ?? [], [rangeQuery.data])
  const byWeek = useMemo(() => groupTasksByWeek(tasks, todayWeek), [tasks, todayWeek])

  // Pendientes globales (livianos) — solo para los puntos del navegador.
  const pendingQuery = usePendingTasks()
  const pendingMonths = useMemo(
    () => pendingMonthsForYear(pendingQuery.data ?? [], navYear, todayWeek),
    [pendingQuery.data, navYear, todayWeek],
  )

  function addReminder(
    weekStart: string,
    title: string,
    priority: TaskPriority,
    category: TaskCategory,
  ) {
    if (createTask.isPending) return
    createTask.mutate({
      title,
      detail: null,
      dueDate: null,
      priority,
      weekStart,
      category,
    })
  }

  const busy = updateTask.isPending || deleteTask.isPending

  function taskLine(task: Task, week: string) {
    return (
      <TaskItem
        key={task.id}
        task={task}
        displayWeek={week}
        busy={busy}
        onToggle={() => {
          const completing = !task.done
          // Al completar un pendiente arrastrado, lo fijamos en la semana actual
          // (queda registrado como hecho esta semana, no en su semana vieja).
          const patch =
            completing && rawTaskWeek(task) < todayWeek
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
    const activeCat = categoryFor(week)
    const visible = filterByCategory(items, activeCat)
    const { pending, done } = splitByStatus(visible, sortMode)
    // Pendientes por pestaña — alimentan el contador discreto de la pestaña inactiva.
    const pendingByCat = countPendingByCategory(items)
    const isCurrent = week === todayWeek
    const rel = relativeWeekLabel(week)
    const titleLong = formatWeekRangeLong(week)
    const showPhotos = photosOpen.has(week)

    return (
      <article
        key={week}
        className="card-paper-soft rounded-xl border border-ink-100/70 animate-fade-up"
        style={isCurrent ? { borderColor: 'var(--accent-sage)' } : undefined}
      >
        {/* Header: rango a la izquierda; ordenar y fotos a la derecha. */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-1">
          <span className="min-w-0">
            {rel && <span className="section-eyebrow text-ink-400 block">{rel}</span>}
            <span className="font-serif text-lg text-ink-700 tracking-tight">
              {titleLong}
            </span>
          </span>
          <div className="shrink-0 flex items-center gap-0.5 -mr-1">
            <span className="text-micro uppercase tracking-eyebrow text-ink-300 tabular-nums mr-1">
              {pending.length > 0
                ? `${pending.length} pend.`
                : done.length > 0
                  ? 'todo hecho'
                  : ''}
            </span>
            <OverflowMenu
              label={`Ordenar — ${SORT_LABELS[sortMode]}`}
              width="w-52"
              triggerClassName="touch-target p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
              triggerContent={<SortIcon />}
            >
              {(close) => (
                <>
                  <p className="px-2.5 pt-1 pb-1.5 text-micro uppercase tracking-eyebrow text-ink-300">
                    Ordenar por
                  </p>
                  {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
                    <OverflowMenuItem
                      key={m}
                      onClick={() => {
                        setSortMode(m)
                        close()
                      }}
                    >
                      <span className="inline-flex w-3 justify-center text-ink-500">
                        {sortMode === m ? '·' : ''}
                      </span>
                      {SORT_LABELS[m]}
                    </OverflowMenuItem>
                  ))}
                </>
              )}
            </OverflowMenu>
            <button
              type="button"
              onClick={() => togglePhotos(week)}
              aria-label="Fotos de la semana"
              aria-expanded={showPhotos}
              title="Fotos de la semana"
              className="touch-target p-1 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors"
            >
              <CameraIcon size={14} />
            </button>
          </div>
        </div>

        {/* Pestañas Trabajo / Personal — clasifican los recordatorios del cuadro. */}
        <div className="px-4 pb-1.5">
          <CategoryTabs
            value={activeCat}
            pendingByCat={pendingByCat}
            onChange={(c) => setCategory(week, c)}
          />
        </div>

        <div className="px-4 pb-3">
          {(pending.length > 0 || done.length > 0) && (
            <ul className="divide-y divide-ink-100/40">
              {pending.map((t) => taskLine(t, week))}
              {done.length > 0 && (
                <li className="list-none pt-2 pb-0.5">
                  <span className="section-eyebrow text-ink-300">
                    hechas · {done.length}
                  </span>
                </li>
              )}
              {done.map((t) => taskLine(t, week))}
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
              onAdd={(title, priority) => addReminder(week, title, priority, activeCat)}
              pending={createTask.isPending}
            />
          </div>

          {/* Fotos de la semana — perezosas: solo si la tira está abierta. */}
          {showPhotos && (
            <AttachmentPhotos
              ownerType="week"
              ownerId={week}
              title={`fotos ${titleLong}`}
            />
          )}
        </div>
      </article>
    )
  }

  const monthKey = `${navYear}-${String(navMonth + 1).padStart(2, '0')}`
  const monthLabel = `${monthName(navMonth)} ${navYear}`

  return (
    <>
      <ViewHeader
        title="Tareas"
        eyebrow="recordatorios de la semana"
        accent={ACCENT}
        subtitle="Cada semana es una hoja. Lo pendiente se arrastra a la semana en curso."
      />

      {/* Media página: navegador a la izquierda, notas del mes a la derecha.
          `items-start` deja que cada caja tenga su alto natural — las notas del
          mes ya no se estiran a 7.5rem cuando están vacías. */}
      <div className="grid md:grid-cols-2 gap-4 mb-4 items-start">
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

      {rangeQuery.isLoading ? (
        <div className="py-10 flex justify-center">
          <LoadingHint text="cargando recordatorios" size="sm" />
        </div>
      ) : rangeQuery.isError && tasks.length === 0 ? (
        // Un fetch fallido NO es un mes vacío: sin esta rama, las hojas semanales
        // se dibujarían sin recordatorios y el fallo pasaría por "no hay nada".
        // `tasks.length === 0` evita pisar el contenido en cache (keepPreviousData)
        // ante un error transitorio al navegar de mes.
        <ErrorState
          title="No se pudieron cargar los recordatorios"
          onRetry={() => rangeQuery.refetch()}
          retrying={rangeQuery.isFetching}
        />
      ) : (
        <div className="space-y-4">{orderedWeekKeys.map(renderWeek)}</div>
      )}
    </>
  )
}

/**
 * Pestañas Trabajo / Personal de un cuadro semanal — control segmentado discreto
 * (mismo lenguaje visual que el resto de Notas). La pestaña inactiva muestra un
 * contador tenue cuando esconde pendientes, para no perderlos de vista.
 */
function CategoryTabs({
  value,
  pendingByCat,
  onChange,
}: {
  value: TaskCategory
  pendingByCat: Record<TaskCategory, number>
  onChange: (c: TaskCategory) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Categoría de tareas"
      className="inline-flex gap-0.5 p-0.5 bg-paper-100/60 rounded-md border border-ink-100/50"
    >
      {CATEGORY_TABS.map((c) => {
        const active = c.key === value
        const n = pendingByCat[c.key]
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(c.key)}
            className={`px-2.5 py-0.5 rounded text-caption transition-colors ${
              active
                ? 'bg-paper-50 text-ink-700 shadow-sm'
                : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            {c.label}
            {!active && n > 0 && (
              <span className="ml-1 tabular-nums text-ink-300">{n}</span>
            )}
          </button>
        )
      })}
    </div>
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
  const [priority, setPriority] = useState<TaskPriority>('baja')

  function submit() {
    const t = title.trim()
    if (!t || pending) return
    onAdd(t, priority)
    setTitle('')
    setPriority('media')
  }

  return (
    <div
      data-testid="week-composer"
      className="flex min-h-[44px] items-center gap-2.5 py-1.5"
    >
      <span className="section-eyebrow text-ink-300">Nueva</span>
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
