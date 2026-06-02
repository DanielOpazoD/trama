import { useMemo } from 'react'
import { useNotesQuery, usePromptsQuery, useTasksQuery } from '../../state'
import { ViewHeader } from '../ViewHeader'
import { EmptyMessage } from '../EmptyMessage'
import { KeyIcon, NotesIcon, PlusIcon, PromptIcon, TasksIcon } from '../Icons'
import type { NotasSection } from './NotasWorld'
import { formatShortDate, todayLocal } from './notasUtils'

const ACCENT = 'var(--accent-sage)'

export function NotasHomeView({
  onNavigate,
}: {
  onNavigate: (section: NotasSection) => void
}) {
  const rawNotes = useNotesQuery().data
  const rawTasks = useTasksQuery().data
  const rawPrompts = usePromptsQuery().data
  const notes = useMemo(() => rawNotes ?? [], [rawNotes])
  const tasks = useMemo(() => rawTasks ?? [], [rawTasks])
  const prompts = useMemo(() => rawPrompts ?? [], [rawPrompts])
  const today = todayLocal()

  const urgentTasks = useMemo(
    () => tasks.filter((t) => !t.done && t.dueDate && t.dueDate <= today).slice(0, 5),
    [tasks, today],
  )
  const topNotes = useMemo(
    () => [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned)).slice(0, 4),
    [notes],
  )
  const topPrompts = useMemo(
    () =>
      [...prompts]
        .sort(
          (a, b) => Number(b.favorite) - Number(a.favorite) || b.useCount - a.useCount,
        )
        .slice(0, 4),
    [prompts],
  )
  const hasAnything = notes.length + tasks.length + prompts.length > 0

  return (
    <>
      <ViewHeader title="Hoy" eyebrow="mundo notas" accent={ACCENT} spacing="wide" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
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
        <QuickAction icon={KeyIcon} label="clave" onClick={() => onNavigate('claves')} />
      </div>

      {!hasAnything ? (
        <EmptyMessage
          illustration="thread"
          title="Tu centro de trabajo está listo."
          body={<>Crea una nota, una tarea, un prompt o una clave para empezar.</>}
          hint="Los accesos de arriba abren cada módulo."
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          <HubCard title="Tareas urgentes" count={urgentTasks.length}>
            {urgentTasks.length === 0 ? (
              <Muted>Nada vencido ni para hoy.</Muted>
            ) : (
              urgentTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onNavigate('tareas')}
                  className="w-full text-left py-1.5 border-b border-ink-100/50 last:border-0"
                >
                  <p className="text-sm text-ink-700 truncate">{t.title}</p>
                  <p className="text-micro uppercase tracking-eyebrow text-[color:var(--accent-clay)]">
                    {t.dueDate && t.dueDate < today ? 'vencida' : 'hoy'} ·{' '}
                    {formatShortDate(t.dueDate)}
                  </p>
                </button>
              ))
            )}
          </HubCard>
          <HubCard title="Notas vivas" count={topNotes.length}>
            {topNotes.map((n) => (
              <button
                key={n.id}
                onClick={() => onNavigate('notas')}
                className="w-full text-left py-1.5 border-b border-ink-100/50 last:border-0"
              >
                <p className="text-sm text-ink-700 line-clamp-2">{n.content}</p>
              </button>
            ))}
            {topNotes.length === 0 && <Muted>Sin notas todavía.</Muted>}
          </HubCard>
          <HubCard title="Prompts listos" count={topPrompts.length}>
            {topPrompts.map((p) => (
              <button
                key={p.id}
                onClick={() => onNavigate('prompts')}
                className="w-full text-left py-1.5 border-b border-ink-100/50 last:border-0"
              >
                <p className="text-sm text-ink-700 truncate">{p.title}</p>
                <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                  {p.collection ?? 'sin colección'} · {p.useCount} usos
                </p>
              </button>
            ))}
            {topPrompts.length === 0 && <Muted>Sin prompts todavía.</Muted>}
          </HubCard>
          <HubCard title="Vault" count={0}>
            <button
              onClick={() => onNavigate('claves')}
              className="w-full text-left py-1.5"
            >
              <p className="text-sm text-ink-700 truncate">Claves protegidas</p>
              <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                requiere clave de acceso
              </p>
            </button>
          </HubCard>
        </div>
      )}
    </>
  )
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="card-paper-soft rounded-lg border border-ink-100/70 px-3 py-2 flex items-center justify-between text-left hover:border-ink-200 transition-colors"
    >
      <span className="inline-flex items-center gap-2 text-sm text-ink-700">
        <span className="inline-flex" style={{ color: ACCENT }}>
          <Icon size={14} />
        </span>
        nueva {label}
      </span>
      <PlusIcon size={13} className="text-ink-300" />
    </button>
  )
}

function HubCard({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="card-paper-soft rounded-xl border border-ink-100/70 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="section-eyebrow text-ink-400">{title}</h3>
        <span className="text-micro tabular-nums text-ink-300">{count}</span>
      </div>
      {children}
    </section>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-300 py-2">{children}</p>
}
