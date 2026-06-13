import { useState } from 'react'
import {
  useCreateReadingTable,
  useDeleteReadingTable,
  useNotesQuery,
  usePendingTasks,
  useProactiveQuery,
  usePromoteNote,
  useReadingTablesQuery,
  useRecortesQuery,
  useResolveProactive,
  useUpdateRecorte,
  useUpdateTask,
} from '../state'
import { useToast } from '../state/toast'
import type { ReadingTable } from '../api'
import { EditorialReader } from './EditorialReader'
import { EditorialProjectPanel } from './EditorialProjectPanel'
import {
  buildKnowledgeInbox,
  knowledgeInboxCounts,
  type KnowledgeInboxItem,
} from '../lib/knowledgeWorkflow'
import { buildEditorialMarkdown, buildNarrativeProposal } from '../lib/editorialDraft'
import { useKnowledgeWorkbench } from '../hooks/useKnowledgeWorkbench'
import { EmptyMessage } from './EmptyMessage'
import { SparkleIcon } from './Icons'
import { ViewHeader } from './ViewHeader'

/** Deep-link de proyecto: ?project=<id> abre ese proyecto directo en la mesa. */
function initialProjectId(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('project')
}

function syncProjectUrl(id: string | null) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('project', id)
  else url.searchParams.delete('project')
  window.history.replaceState(null, '', url)
}

export function KnowledgeWorkflowView() {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const recortes = useRecortesQuery()
  const suggestions = useProactiveQuery()
  const notes = useNotesQuery()
  const tasks = usePendingTasks()

  const inbox = buildKnowledgeInbox({
    recortes: recortes.data ?? [],
    suggestions: suggestions.data ?? [],
    notes: notes.data ?? [],
    tasks: tasks.data ?? [],
  })
  const counts = knowledgeInboxCounts(inbox)
  const loading =
    recortes.isLoading || suggestions.isLoading || notes.isLoading || tasks.isLoading
  const workbench = useKnowledgeWorkbench()
  const selectedItems = workbench.selectedIds
    .map((id) => inbox.find((item) => item.id === id))
    .filter((item): item is KnowledgeInboxItem => Boolean(item))
  const proposal = buildNarrativeProposal(selectedItems)
  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(buildEditorialMarkdown(selectedItems, proposal))
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  const projects = useReadingTablesQuery()
  const createProject = useCreateReadingTable()
  const deleteProject = useDeleteReadingTable()
  const [projectTitle, setProjectTitle] = useState('')
  const [readingOpen, setReadingOpen] = useState(false)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialProjectId)
  const activeProject =
    (projects.data ?? []).find((p) => p.id === activeProjectId) ?? null
  const openProject = (p: ReadingTable) => {
    setActiveProjectId(p.id)
    workbench.setSelected(p.materialIds)
    syncProjectUrl(p.id)
  }
  const closeProject = () => {
    setActiveProjectId(null)
    syncProjectUrl(null)
  }
  const saveProject = async () => {
    const title =
      projectTitle.trim() || proposal.thesis.slice(0, 80) || 'Proyecto sin título'
    await createProject.mutateAsync({
      title,
      materialIds: workbench.selectedIds,
      draftMarkdown: buildEditorialMarkdown(selectedItems, proposal),
    })
    setProjectTitle('')
  }

  const updateRecorte = useUpdateRecorte()
  const resolveSuggestion = useResolveProactive()
  const promoteNote = usePromoteNote()
  const updateTask = useUpdateTask()
  const toast = useToast()
  /** Cierra el ciclo desde el inbox reusando las mutaciones que ya existen:
   *  cada acción saca el material de pendientes (y por ende del inbox). */
  const actOnItem = (item: KnowledgeInboxItem) => {
    switch (item.source) {
      case 'recorte':
        updateRecorte.mutate({ id: item.sourceId, patch: { status: 'archived' } })
        toast.show({ message: 'Recorte archivado', tone: 'success' })
        break
      case 'suggestion':
        resolveSuggestion.mutate({ id: item.sourceId, status: 'dismissed' })
        toast.show({ message: 'Sugerencia descartada' })
        break
      case 'note':
        promoteNote.mutate(item.sourceId)
        toast.show({ message: 'Nota promovida a Momento', tone: 'success' })
        break
      case 'task':
        updateTask.mutate({ id: item.sourceId, patch: { done: true } })
        toast.show({ message: 'Tarea completada', tone: 'success' })
        break
    }
  }

  return (
    <>
      <ViewHeader
        title="Mesa editorial"
        eyebrow="del material al borrador"
        accent="var(--accent-primary)"
        eyebrowColor="var(--accent-gold)"
        spacing="wide"
        subtitle="Una capa de trabajo dentro de Recortes: procesar pendientes, armar mesas de lectura, guardar proyectos y leer borradores sin sumar otra sección al producto."
        icon={<SparkleIcon size={22} />}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <section className="space-y-3" aria-label="Inbox de conocimiento">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h3 className="font-serif text-2xl text-ink-700">Inbox de conocimiento</h3>
              <p className="mt-1 text-xs text-ink-400">
                {counts.total === 0
                  ? 'Sin materiales pendientes'
                  : `${counts.total} pendientes · ${counts.high} alta prioridad`}
              </p>
            </div>
            <div className="flex gap-1.5 text-micro uppercase tracking-eyebrow text-ink-300">
              <span>{counts.recortes} recortes</span>
              <span>·</span>
              <span>{counts.suggestions} IA</span>
              <span>·</span>
              <span>{counts.tasks} tareas</span>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-ink-300 italic">cargando mesa…</p>
          ) : inbox.length === 0 ? (
            <EmptyMessage
              variant="plain"
              illustration="thread"
              title="Nada urgente para procesar."
              body="Cuando lleguen recortes, sugerencias, notas fijadas o tareas de escritura, aparecerán aquí para que el siguiente paso sea obvio."
            />
          ) : (
            <ul className="space-y-3">
              {inbox.map((item) => (
                <KnowledgeInboxCard
                  key={item.id}
                  item={item}
                  selected={workbench.isSelected(item.id)}
                  onAdd={() => workbench.toggleItem(item.id)}
                  onAct={() => actOnItem(item)}
                  actionLabel={inboxActionLabel(item.source)}
                />
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-5">
          <section aria-label="Mesa de lectura" className="card-paper-soft p-4 space-y-3">
            <div>
              <p className="section-eyebrow">mesa de lectura</p>
              <h3 className="mt-1 font-serif text-xl text-ink-700">
                Materiales elegidos
              </h3>
            </div>
            {selectedItems.length === 0 ? (
              <p className="text-sm text-ink-400 leading-relaxed">
                Selecciona materiales del inbox para armar una mesa temporal.
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {selectedItems.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-md border border-ink-100/70 bg-paper-50/60 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-micro uppercase tracking-eyebrow text-ink-300">
                            {sourceLabel(item.source)}
                          </p>
                          <p className="mt-0.5 font-serif text-sm text-ink-700 leading-tight">
                            {item.title}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => workbench.removeItem(item.id)}
                          className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
                        >
                          quitar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    value={projectTitle}
                    onChange={(e) => setProjectTitle(e.target.value)}
                    placeholder="Título del proyecto…"
                    aria-label="Título del proyecto"
                    className="min-w-0 flex-1 rounded-md border border-ink-100 bg-paper-50 px-2.5 py-1.5 text-sm text-ink-700 placeholder:text-ink-300 focus:border-[color:var(--accent-primary)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={saveProject}
                    disabled={createProject.isPending}
                    className="shrink-0 rounded-full bg-ink-800 px-3 py-1.5 text-xs font-medium text-paper-50 transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    Guardar proyecto
                  </button>
                </div>
                <button
                  type="button"
                  onClick={workbench.clear}
                  className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-800 transition-colors"
                >
                  vaciar mesa
                </button>
              </>
            )}
          </section>

          {activeProject ? (
            <EditorialProjectPanel project={activeProject} onClose={closeProject} />
          ) : (
            <section className="card-paper p-4 space-y-2">
              <p className="section-eyebrow">borrador editorial</p>
              {selectedItems.length === 0 ? (
                <p className="text-sm text-ink-400 leading-relaxed">
                  La propuesta narrativa aparecerá cuando la mesa tenga materiales.
                </p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h3 className="font-serif text-xl text-ink-700">
                        Propuesta narrativa
                      </h3>
                      <div className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setReadingOpen(true)}
                          className="text-micro uppercase tracking-eyebrow text-ink-400 transition-colors hover:text-[color:var(--accent-primary)]"
                        >
                          leer
                        </button>
                        <button
                          type="button"
                          onClick={copyMarkdown}
                          className="text-micro uppercase tracking-eyebrow text-ink-400 transition-colors hover:text-ink-800"
                        >
                          copiar Markdown
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 text-micro uppercase tracking-eyebrow text-ink-300">
                      Tesis provisional
                    </p>
                    {copyStatus === 'copied' && (
                      <p className="mt-1 text-xs text-[color:var(--accent-primary)]">
                        Markdown copiado
                      </p>
                    )}
                    {copyStatus === 'error' && (
                      <p className="mt-1 text-xs text-red-700">
                        No se pudo copiar el Markdown
                      </p>
                    )}
                    <p className="mt-1 text-sm text-ink-600 leading-relaxed">
                      {proposal.thesis}
                    </p>
                  </div>
                  <div>
                    <p className="section-eyebrow">estructura</p>
                    <ol className="mt-2 space-y-2">
                      {proposal.outline.map((section) => (
                        <li key={section.title}>
                          <p className="font-serif text-sm text-ink-700">
                            {section.title}
                          </p>
                          <p className="text-xs text-ink-400 leading-relaxed">
                            {section.prompt}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <p className="section-eyebrow">Huecos a revisar</p>
                    <ul className="mt-2 space-y-1">
                      {proposal.gaps.map((gap) => (
                        <li key={gap} className="text-xs text-ink-400 leading-relaxed">
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          )}

          <section
            aria-label="Proyectos guardados"
            className="card-paper-soft p-4 space-y-3"
          >
            <div>
              <p className="section-eyebrow">proyectos</p>
              <h3 className="mt-1 font-serif text-xl text-ink-700">Guardados</h3>
            </div>
            {(projects.data ?? []).length === 0 ? (
              <p className="text-sm text-ink-400 leading-relaxed">
                Guarda una mesa como proyecto para volver a ella cuando quieras.
              </p>
            ) : (
              <ul className="space-y-2">
                {(projects.data ?? []).map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onOpen={() => openProject(project)}
                    onDelete={() => deleteProject.mutate(project.id)}
                  />
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      <EditorialReader
        open={readingOpen}
        onClose={() => setReadingOpen(false)}
        title="Borrador editorial"
        markdown={buildEditorialMarkdown(selectedItems, proposal)}
      />
    </>
  )
}

function inboxActionLabel(source: KnowledgeInboxItem['source']): string {
  if (source === 'recorte') return 'archivar'
  if (source === 'suggestion') return 'descartar'
  if (source === 'task') return 'completar'
  return 'a momento'
}

function KnowledgeInboxCard({
  item,
  selected,
  onAdd,
  onAct,
  actionLabel,
}: {
  item: KnowledgeInboxItem
  selected: boolean
  onAdd: () => void
  onAct: () => void
  actionLabel: string
}) {
  return (
    <li className="card-paper-soft p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-micro uppercase tracking-eyebrow text-[color:var(--accent-primary)]">
              {sourceLabel(item.source)}
            </span>
            <span className="text-micro uppercase tracking-eyebrow text-ink-300">
              {item.urgency}
            </span>
          </div>
          <h4 className="mt-1 font-serif text-lg leading-tight text-ink-700">
            {item.title}
          </h4>
          <p className="mt-1 text-sm text-ink-500 leading-relaxed line-clamp-3 whitespace-pre-wrap">
            {item.excerpt}
          </p>
          {item.meta && <p className="mt-2 text-micro text-ink-300">{item.meta}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={onAdd}
            disabled={selected}
            className="text-micro uppercase tracking-eyebrow text-ink-400 transition-colors hover:text-ink-800 disabled:text-ink-300"
          >
            {selected ? 'añadido' : 'añadir a mesa'}
          </button>
          <button
            type="button"
            onClick={onAct}
            className="text-micro uppercase tracking-eyebrow text-ink-300 transition-colors hover:text-[color:var(--accent-primary)]"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </li>
  )
}

function ProjectRow({
  project,
  onOpen,
  onDelete,
}: {
  project: ReadingTable
  onOpen: () => void
  onDelete: () => void
}) {
  const n = project.materialIds.length
  return (
    <li className="rounded-md border border-ink-100/70 bg-paper-50/60 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="font-serif text-sm text-ink-700 leading-tight hover:underline">
            {project.title}
          </p>
          <p className="mt-0.5 text-micro text-ink-300">
            {n} material{n === 1 ? '' : 'es'} · abrir
          </p>
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-micro uppercase tracking-eyebrow text-ink-300 transition-colors hover:text-[color:var(--accent-clay)]"
        >
          eliminar
        </button>
      </div>
    </li>
  )
}

function sourceLabel(source: KnowledgeInboxItem['source']): string {
  if (source === 'recorte') return 'recorte'
  if (source === 'suggestion') return 'sugerencia'
  if (source === 'task') return 'tarea'
  return 'nota'
}
