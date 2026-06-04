import { useMemo, useState } from 'react'
import {
  useTasksQuery,
  useUpdateTask,
  useMarkPromptUsed,
  usePromptsQuery,
  useNotesQuery,
  useToast,
} from '../../state'
import { KeyIcon, SearchIcon } from '../Icons'
import type { NotasSection } from '../../types/notas'
import { copyText } from './notasUtils'
import { matchModuleAlias } from './moduleAliases'
import { useModuleVisibility } from '../../hooks/useModuleVisibility'

export function NotasGlobalSearch({
  onNavigate,
  autoFocus = false,
}: {
  onNavigate: (section: NotasSection) => void
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const hasQuery = q.trim().length > 0
  const rawNotes = useNotesQuery().data
  // El buscador vive en el chrome (siempre montado). Las tareas pueden crecer
  // mucho con el tiempo, así que solo las cargamos cuando hay algo que buscar.
  const rawTasks = useTasksQuery({ enabled: hasQuery }).data
  const rawPrompts = usePromptsQuery().data
  const notes = useMemo(() => rawNotes ?? [], [rawNotes])
  const tasks = useMemo(() => rawTasks ?? [], [rawTasks])
  const prompts = useMemo(() => rawPrompts ?? [], [rawPrompts])
  const updateTask = useUpdateTask()
  const markPromptUsed = useMarkPromptUsed()
  const toast = useToast()
  const { isVisible, reveal } = useModuleVisibility()

  // Comando para abrir/revelar un módulo (p. ej. "#pass" → Claves), aunque esté
  // oculto en la barra. Es acceso rápido, no seguridad.
  const alias = matchModuleAlias(q)

  const query = q.trim().toLowerCase()
  const results = useMemo(() => {
    if (!query) return null
    return {
      notes: notes.filter((n) => n.content.toLowerCase().includes(query)).slice(0, 3),
      tasks: tasks
        .filter((t) => `${t.title}\n${t.detail ?? ''}`.toLowerCase().includes(query))
        .slice(0, 3),
      prompts: prompts
        .filter((p) =>
          `${p.title}\n${p.content}\n${p.collection ?? ''}`.toLowerCase().includes(query),
        )
        .slice(0, 3),
    }
  }, [notes, prompts, query, tasks])

  async function copyPrompt(id: string, content: string) {
    await copyText(content)
    markPromptUsed.mutate(id)
    toast.show({ message: 'Prompt copiado.', tone: 'success' })
  }

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 px-3 py-2 bg-paper-50 border border-ink-100/70 rounded-lg">
        <SearchIcon size={14} className="text-ink-300 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar en notas, tareas, prompts y claves..."
          className="flex-1 bg-transparent text-sm text-ink-700 placeholder:text-ink-300"
          autoFocus={autoFocus}
        />
        {q && (
          <button
            onClick={() => setQ('')}
            aria-label="Limpiar búsqueda global"
            className="text-ink-300 hover:text-ink-700 text-caption"
          >
            x
          </button>
        )}
      </div>

      {alias && (
        <button
          onClick={() => {
            reveal(alias.moduleId)
            onNavigate(alias.moduleId)
          }}
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-ink-100/70 bg-paper-50 px-3 py-2 text-sm text-ink-700 hover:border-ink-200 transition-colors"
        >
          <span className="shrink-0" style={{ color: 'var(--accent-sage)' }}>
            <KeyIcon size={14} />
          </span>
          <span>
            {isVisible(alias.moduleId) ? 'Abrir' : 'Revelar'}{' '}
            <strong className="font-medium">{alias.label}</strong>
          </span>
          <span className="ml-auto text-micro uppercase tracking-eyebrow text-ink-300">
            acceso rápido
          </span>
        </button>
      )}

      {results && (
        <div className="mt-2 grid md:grid-cols-2 gap-2">
          <Group title="Notas">
            {results.notes.map((n) => (
              <Result key={n.id} onClick={() => onNavigate('notas')}>
                {n.content}
              </Result>
            ))}
          </Group>
          <Group title="Tareas">
            {results.tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded px-1.5 py-1 text-caption text-ink-600 hover:bg-ink-100/50"
              >
                <button
                  onClick={() => onNavigate('tareas')}
                  className="min-w-0 flex-1 text-left truncate"
                >
                  {t.title}
                </button>
                {!t.done && (
                  <button
                    onClick={() => updateTask.mutate({ id: t.id, patch: { done: true } })}
                    className="section-eyebrow hover:text-ink-700"
                  >
                    hecha
                  </button>
                )}
              </div>
            ))}
          </Group>
          <Group title="Prompts">
            {results.prompts.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded px-1.5 py-1 text-caption text-ink-600 hover:bg-ink-100/50"
              >
                <button
                  onClick={() => onNavigate('prompts')}
                  className="min-w-0 flex-1 text-left truncate"
                >
                  {p.title}
                </button>
                <button
                  onClick={() => void copyPrompt(p.id, p.content)}
                  className="section-eyebrow hover:text-ink-700"
                >
                  copiar
                </button>
              </div>
            ))}
          </Group>
          <Group title="Claves">
            <button
              onClick={() => onNavigate('claves')}
              className="block w-full text-left rounded px-1.5 py-1 text-caption text-ink-500 hover:bg-ink-100/50"
            >
              Abrir vault protegido
            </button>
          </Group>
        </div>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-paper-soft rounded-lg border border-ink-100/70 p-3">
      <h4 className="section-eyebrow text-ink-300 mb-1.5">{title}</h4>
      <div className="space-y-1">
        {children || <p className="text-caption text-ink-300">Sin resultados.</p>}
      </div>
    </section>
  )
}

function Result({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left truncate rounded px-1.5 py-1 text-caption text-ink-600 hover:bg-ink-100/50"
    >
      {children}
    </button>
  )
}
