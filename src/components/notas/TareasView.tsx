import { useMemo, useState } from 'react'
import { useTasksQuery, useCreateTask, useUpdateTask, useDeleteTask } from '../../state'
import { EmptyMessage } from '../EmptyMessage'
import { LoadingHint } from '../LoadingHint'
import { SearchIcon } from '../Icons'
import { TaskItem } from './TaskItem'
import { ActivityCalendar } from './ActivityCalendar'

function todayLocal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

const ACCENT = 'var(--accent-sage)'

/**
 * τ-worlds Fase 3: la sección Tareas de Trama Notas. Pendientes livianos —
 * título + detalle + fecha opcionales, con las mismas #etiquetas que las
 * notas. Buscador y filtro por etiqueta son client-side (instantáneos). La
 * lista separa pendientes (arriba) de hechas (abajo, atenuadas).
 */
export function TareasView() {
  const tasksQuery = useTasksQuery()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [due, setDue] = useState('')
  // El vencimiento es opcional: el campo aparece solo si el usuario lo pide.
  const [showDue, setShowDue] = useState(false)
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  // Día seleccionado en el calendario (filtra por fecha de vencimiento), o null.
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const t of tasks) for (const tag of t.tags) set.add(tag)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [tasks])

  // Calendario de Tareas: por fecha de VENCIMIENTO, solo PENDIENTES (las hechas
  // y las sin fecha no aparecen). El número en cada día = tareas por vencer.
  const calendarDays = useMemo(
    () => tasks.filter((t) => t.dueDate && !t.done).map((t) => t.dueDate as string),
    [tasks],
  )
  const calendarStats = useMemo(() => {
    const today = todayLocal()
    const pendientes = tasks.filter((t) => !t.done).length
    const vencidas = tasks.filter(
      (t) => !t.done && t.dueDate !== null && t.dueDate < today,
    ).length
    return [
      { n: tasks.length, label: tasks.length === 1 ? 'tarea' : 'tareas' },
      { n: pendientes, label: 'pendientes' },
      { n: vencidas, label: vencidas === 1 ? 'vencida' : 'vencidas' },
    ]
  }, [tasks])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter((t) => {
      if (activeTag && !t.tags.includes(activeTag)) return false
      if (selectedDay && t.dueDate !== selectedDay) return false
      if (q && !`${t.title}\n${t.detail ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, search, activeTag, selectedDay])

  function clearFilters() {
    setSearch('')
    setActiveTag(null)
    setSelectedDay(null)
  }

  const pending = filtered.filter((t) => !t.done)
  const done = filtered.filter((t) => t.done)

  function save() {
    const t = title.trim()
    if (!t || createTask.isPending) return
    createTask.mutate(
      { title: t, detail: detail.trim() || null, dueDate: due || null },
      {
        onSuccess: () => {
          setTitle('')
          setDetail('')
          setDue('')
          setShowDue(false)
        },
      },
    )
  }

  function onComposerKey(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      save()
    }
  }

  const busy = updateTask.isPending || deleteTask.isPending

  return (
    <>
      {/* Composer */}
      <div className="card-paper-soft rounded-xl border border-ink-100/70 p-3 mb-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={onComposerKey}
          placeholder="Nueva tarea… usa #etiquetas para clasificarla"
          className="w-full bg-transparent text-ink-700 placeholder:text-ink-300 leading-relaxed"
        />
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          onKeyDown={onComposerKey}
          rows={2}
          placeholder="Detalle (opcional)"
          className="w-full resize-y bg-transparent text-sm text-ink-600 placeholder:text-ink-300 leading-relaxed mt-1"
        />
        <div className="flex items-center justify-between gap-3 pt-2 mt-1 border-t border-ink-100/60">
          {/* Vencimiento opcional: por defecto solo un enlace discreto; el
              campo de fecha aparece si el usuario decide ponerle plazo. */}
          {showDue || due ? (
            <label className="text-micro uppercase tracking-eyebrow text-ink-400 flex items-center gap-2">
              vence
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="input-paper text-sm normal-case tracking-normal"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setDue('')
                  setShowDue(false)
                }}
                aria-label="Quitar vencimiento"
                className="text-ink-300 hover:text-ink-700 transition-colors"
              >
                ✕
              </button>
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setShowDue(true)}
              className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
            >
              + fecha de vencimiento
            </button>
          )}
          <button
            onClick={save}
            disabled={!title.trim() || createTask.isPending}
            className="btn-ink text-xs disabled:opacity-40"
          >
            {createTask.isPending ? 'Agregando…' : 'Agregar tarea'}
          </button>
        </div>
      </div>

      {/* Calendario por vencimiento — solo si hay tareas con fecha */}
      {calendarDays.length > 0 && (
        <ActivityCalendar
          dayKeys={calendarDays}
          stats={calendarStats}
          unit={{ one: 'tarea', many: 'tareas' }}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      )}

      {/* Buscador + chips — solo si ya hay tareas */}
      {tasks.length > 0 && (
        <div className="mb-5 space-y-2.5">
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-paper-50 border border-ink-100/60 rounded-md">
            <SearchIcon size={13} className="text-ink-300 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en tus tareas…"
              className="flex-1 bg-transparent text-caption text-ink-700 placeholder:text-ink-300"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                aria-label="Limpiar búsqueda"
                className="text-ink-300 hover:text-ink-700 text-caption"
              >
                ✕
              </button>
            )}
          </div>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveTag(null)}
                className={`text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border transition-colors ${
                  activeTag === null
                    ? 'border-ink-200 text-ink-700 bg-ink-100/50'
                    : 'border-ink-100 text-ink-400 hover:text-ink-700'
                }`}
              >
                todas
              </button>
              {allTags.map((t) => {
                const on = activeTag === t
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTag(on ? null : t)}
                    className="text-micro uppercase tracking-eyebrow px-2 py-0.5 rounded-full border transition-colors"
                    style={
                      on
                        ? {
                            borderColor: ACCENT,
                            color: ACCENT,
                            background: 'var(--accent-sage-soft, transparent)',
                          }
                        : undefined
                    }
                  >
                    #{t}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Lista / estados */}
      {tasksQuery.isLoading ? (
        <div className="py-10 flex justify-center">
          <LoadingHint text="cargando tareas" size="sm" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Nada pendiente… por ahora."
          body={
            <>
              Anota arriba lo que tengas que hacer — una tarea, un recado, un pendiente
              mental. Con <strong>#etiquetas</strong> y una fecha opcional las mantienes
              ordenadas.
            </>
          }
          hint="⌘↵ para agregar rápido; márcalas como hechas con el check."
        />
      ) : filtered.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Nada coincide con eso."
          body={<>Prueba con otra palabra, otra etiqueta u otro día.</>}
          hint={
            <button
              onClick={clearFilters}
              className="underline hover:text-ink-700 transition-colors"
            >
              Ver todas
            </button>
          }
        />
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-3">
              {pending.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  busy={busy}
                  onToggle={() =>
                    updateTask.mutate({ id: task.id, patch: { done: true } })
                  }
                  onSave={(patch) => updateTask.mutate({ id: task.id, patch })}
                  onDelete={() => deleteTask.mutate(task.id)}
                />
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div className="space-y-3">
              <h4 className="section-eyebrow text-ink-300">hechas · {done.length}</h4>
              {done.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  busy={busy}
                  onToggle={() =>
                    updateTask.mutate({ id: task.id, patch: { done: false } })
                  }
                  onSave={(patch) => updateTask.mutate({ id: task.id, patch })}
                  onDelete={() => deleteTask.mutate(task.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
