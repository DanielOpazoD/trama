import { useMemo } from 'react'
import { useNotesQuery, usePromptsQuery, usePendingTasks } from '../../state'
import { ViewHeader } from '../ViewHeader'
import { EmptyMessage } from '../EmptyMessage'
import { NotesIcon, PlusIcon, PromptIcon, TasksIcon } from '../Icons'
import type { NotasSection } from '../../types/notas'
import { PRIORITY_META } from './PriorityDots'
import { buildNotasHomeModel } from './notasHomeModel'
import { weekStartLocal } from './notasUtils'

const ACCENT = 'var(--accent-sage)'

export function NotasHomeView({
  onNavigate,
}: {
  onNavigate: (section: NotasSection) => void
}) {
  const notesQuery = useNotesQuery()
  const tasksQuery = usePendingTasks()
  const promptsQuery = usePromptsQuery()
  const rawNotes = notesQuery.data
  const rawTasks = tasksQuery.data
  const rawPrompts = promptsQuery.data
  const notes = useMemo(() => rawNotes ?? [], [rawNotes])
  const tasks = useMemo(() => rawTasks ?? [], [rawTasks])
  const prompts = useMemo(() => rawPrompts ?? [], [rawPrompts])

  const todayWeek = useMemo(() => weekStartLocal(), [])
  const home = useMemo(
    () => buildNotasHomeModel({ notes, tasks, prompts, todayWeek }),
    [notes, prompts, tasks, todayWeek],
  )
  const initialLoading =
    rawNotes === undefined || rawTasks === undefined || rawPrompts === undefined
  const hasAnything = notes.length + tasks.length + prompts.length > 0

  return (
    <>
      <ViewHeader title="Hoy" eyebrow="mundo notas" accent={ACCENT} spacing="wide" />

      <section
        aria-label="Turno del día"
        className="mb-4 rounded-xl border border-ink-100/70 bg-paper-100/45 px-4 py-3"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-micro uppercase tracking-eyebrow text-ink-300">
              turno del día
            </p>
            <p className="mt-1 font-serif text-h2 text-ink-700">{home.daily.headline}</p>
            <p className="mt-1 text-caption text-ink-400">{home.daily.subline}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:w-72">
            <QuickAction
              icon={NotesIcon}
              label="nota"
              verb="capturar"
              onClick={() => onNavigate('notas')}
            />
            <QuickAction
              icon={TasksIcon}
              label="tarea"
              verb="capturar"
              onClick={() => onNavigate('tareas')}
            />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-5">
        <QuickAction icon={NotesIcon} label="nota" onClick={() => onNavigate('notas')} />
        <QuickAction
          icon={TasksIcon}
          label="tarea"
          onClick={() => onNavigate('tareas')}
        />
        <QuickAction
          icon={PromptIcon}
          label="prompt"
          onClick={() => onNavigate('prompts')}
        />
      </div>

      {initialLoading ? (
        <NotasHomeLoading />
      ) : !hasAnything ? (
        <EmptyMessage
          illustration="thread"
          title="Tu centro de trabajo está listo."
          body={<>Elige una primera entrada para abrir el día.</>}
          action={
            <>
              <button
                type="button"
                onClick={() => onNavigate('notas')}
                className="btn-ink min-h-[44px] px-4 text-caption"
              >
                Crear nota
              </button>
              <button
                type="button"
                onClick={() => onNavigate('tareas')}
                className="min-h-[44px] rounded-md border border-ink-100 bg-paper-50 px-4 text-caption uppercase tracking-eyebrow text-ink-500 hover:text-ink-800 hover:border-ink-200 transition-colors"
              >
                Crear tarea
              </button>
            </>
          }
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          <HubCard title="Esta semana" count={home.currentTasks.length}>
            {home.currentTasks.length === 0 ? (
              <Muted>Lo pendiente viene de semanas anteriores.</Muted>
            ) : (
              home.currentTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onNavigate('tareas')}
                  className="w-full text-left py-1.5 border-b border-ink-100/50 last:border-0 flex items-center gap-2.5"
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full shrink-0"
                    style={{ backgroundColor: PRIORITY_META[t.priority].color }}
                    title={`Prioridad ${PRIORITY_META[t.priority].label}`}
                  />
                  <p className="text-body text-ink-700 truncate">{t.title}</p>
                </button>
              ))
            )}
          </HubCard>
          <HubCard
            title="Heredadas"
            count={home.inheritedTasks.length}
            ariaLabel="Tareas pendientes heredadas"
          >
            {home.inheritedTasks.length === 0 ? (
              <Muted>Sin arrastre antiguo.</Muted>
            ) : (
              home.inheritedTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onNavigate('tareas')}
                  className="w-full text-left py-1.5 border-b border-ink-100/50 last:border-0"
                >
                  <p className="text-body text-ink-700 truncate">{t.title}</p>
                  <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                    pendiente desde {t.weekStart}
                  </p>
                </button>
              ))
            )}
          </HubCard>
          <HubCard
            title="Bandeja"
            count={home.noteInbox.length}
            ariaLabel="Bandeja de notas"
          >
            {home.noteInbox.length === 0 ? (
              <Muted>No hay notas por clasificar.</Muted>
            ) : (
              home.noteInbox.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onNavigate('notas')}
                  className="w-full text-left py-1.5 border-b border-ink-100/50 last:border-0"
                >
                  <p className="text-body text-ink-700 line-clamp-2">{n.content}</p>
                  <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                    {n.reason}
                  </p>
                </button>
              ))
            )}
          </HubCard>
          <HubCard
            title="Notas vivas"
            count={home.topNotes.length}
            ariaLabel="Notas fijadas"
          >
            {home.topNotes.map((n) => (
              <button
                key={n.id}
                onClick={() => onNavigate('notas')}
                className="w-full text-left py-1.5 border-b border-ink-100/50 last:border-0"
              >
                <p className="text-body text-ink-700 line-clamp-2">{n.content}</p>
              </button>
            ))}
            {home.topNotes.length === 0 && <Muted>Todavía sin apuntes.</Muted>}
          </HubCard>
          <HubCard title="Prompts listos" count={home.topPrompts.length}>
            {home.topPrompts.map((p) => (
              <button
                key={p.id}
                onClick={() => onNavigate('prompts')}
                className="w-full text-left py-1.5 border-b border-ink-100/50 last:border-0"
              >
                <p className="text-body text-ink-700 truncate">{p.title}</p>
                <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                  {p.collection ?? 'sin colección'} · {p.useCount} usos
                </p>
              </button>
            ))}
            {home.topPrompts.length === 0 && <Muted>Todavía sin prompts.</Muted>}
          </HubCard>
          <HubCard title="Claves" count={0}>
            <button
              onClick={() => onNavigate('claves')}
              className="w-full text-left py-1.5"
            >
              <p className="text-body text-ink-700 truncate">Tus claves, a salvo</p>
              <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                se abren con tu clave
              </p>
            </button>
          </HubCard>
        </div>
      )}
    </>
  )
}

function NotasHomeLoading() {
  return (
    <div
      aria-label="Cargando inicio de Notas"
      className="grid gap-3 md:grid-cols-2"
      aria-busy="true"
    >
      {['Pendientes', 'Notas vivas', 'Prompts listos', 'Claves'].map((title) => (
        <section
          key={title}
          className="card-paper-soft rounded-xl border border-ink-100/70 p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="section-eyebrow text-ink-300">{title}</span>
            <span className="h-2 w-5 rounded-full bg-ink-100/80" />
          </div>
          <div className="space-y-2">
            <span className="block h-3 w-11/12 rounded-full bg-ink-100/70" />
            <span className="block h-3 w-7/12 rounded-full bg-ink-100/55" />
          </div>
        </section>
      ))}
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  verb = 'nueva',
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  verb?: 'nueva' | 'capturar'
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="card-paper-soft min-h-[44px] rounded-lg border border-ink-100/70 px-3 py-2 flex items-center justify-between text-left hover:border-ink-200 transition-colors"
    >
      <span className="inline-flex items-center gap-2 text-body text-ink-700">
        <span className="inline-flex" style={{ color: ACCENT }}>
          <Icon size={14} />
        </span>
        {verb} {label}
      </span>
      <PlusIcon size={12} className="text-ink-300" />
    </button>
  )
}

function HubCard({
  title,
  count,
  ariaLabel,
  children,
}: {
  title: string
  count: number
  ariaLabel?: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={ariaLabel}
      className="card-paper-soft rounded-xl border border-ink-100/70 p-4"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="section-eyebrow text-ink-400">{title}</h3>
        <span className="text-micro tabular-nums text-ink-300">{count}</span>
      </div>
      {children}
    </section>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-body text-ink-300 py-2">{children}</p>
}
