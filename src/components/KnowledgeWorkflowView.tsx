import {
  useNotesQuery,
  usePendingTasks,
  useProactiveQuery,
  useRecortesQuery,
} from '../state'
import {
  buildKnowledgeInbox,
  knowledgeInboxCounts,
  type KnowledgeInboxItem,
} from '../lib/knowledgeWorkflow'
import { EmptyMessage } from './EmptyMessage'
import { SparkleIcon } from './Icons'
import { ViewHeader } from './ViewHeader'

export function KnowledgeWorkflowView() {
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

  return (
    <>
      <ViewHeader
        title="Flujo"
        eyebrow="del material al borrador"
        accent="var(--accent-primary)"
        eyebrowColor="var(--accent-gold)"
        spacing="wide"
        subtitle="Una superficie para procesar lo pendiente: recortes, sugerencias, notas fijadas y tareas que pueden convertirse en una mesa de lectura."
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
            <p className="text-sm text-ink-300 italic">cargando flujo…</p>
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
                <KnowledgeInboxCard key={item.id} item={item} />
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
            <p className="text-sm text-ink-400 leading-relaxed">
              Selecciona materiales del inbox para armar una mesa temporal. En el
              siguiente bloque esta selección persistirá y alimentará el borrador.
            </p>
          </section>

          <section className="card-paper p-4 space-y-2">
            <p className="section-eyebrow">borrador editorial</p>
            <p className="text-sm text-ink-400 leading-relaxed">
              La propuesta narrativa aparecerá cuando la mesa tenga materiales.
            </p>
          </section>
        </aside>
      </div>
    </>
  )
}

function KnowledgeInboxCard({ item }: { item: KnowledgeInboxItem }) {
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
        <button
          type="button"
          className="text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-800 transition-colors"
        >
          añadir a mesa
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
