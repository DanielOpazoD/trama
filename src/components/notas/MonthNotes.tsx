import { useEffect, useState } from 'react'
import type { TaskCategory } from '../../api'
import { useMonthNoteQuery, useSaveMonthNote } from '../../state'
import { useAutosizeTextarea } from '../../hooks/useAutosizeTextarea'
import { ErrorState } from '../ErrorState'

const CATEGORY_TABS: { key: TaskCategory; label: string }[] = [
  { key: 'trabajo', label: 'Trabajo' },
  { key: 'personal', label: 'Personal' },
]

/**
 * Notas globales del mes (Tareas), divididas en Trabajo / Personal —igual que
 * los recordatorios. Un cuadro de texto libre por categoría, que se guarda solo.
 * El padre la monta con key={monthKey} para refrescar al cambiar de mes; la
 * pestaña arranca en Trabajo (donde caen las notas históricas).
 */
export function MonthNotes({ monthKey, label }: { monthKey: string; label: string }) {
  const [category, setCategory] = useState<TaskCategory>('trabajo')
  return (
    <div className="card-paper-soft rounded-xl border border-ink-100/70 p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="section-eyebrow text-ink-400">Notas de {label}</span>
        <div
          role="tablist"
          aria-label="Categoría de notas del mes"
          className="inline-flex gap-0.5 p-0.5 bg-paper-100/60 rounded-md border border-ink-100/50"
        >
          {CATEGORY_TABS.map((c) => {
            const active = c.key === category
            return (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(c.key)}
                className={`px-2.5 py-0.5 rounded text-caption transition-colors ${
                  active
                    ? 'bg-paper-50 text-ink-700 shadow-sm'
                    : 'text-ink-400 hover:text-ink-700'
                }`}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>
      {/* key=category → recarga el campo al cambiar de pestaña (load-once limpio). */}
      <MonthNoteField key={category} monthKey={monthKey} category={category} />
    </div>
  )
}

/** Editor de una (mes, categoría): carga inicial + autoguardado con un respiro. */
function MonthNoteField({
  monthKey,
  category,
}: {
  monthKey: string
  category: TaskCategory
}) {
  const query = useMonthNoteQuery(monthKey, category)
  const save = useSaveMonthNote()
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  // Crece con el contenido: vacío = ~2 líneas (no la caja fija de 7.5rem).
  const textareaRef = useAutosizeTextarea(text, { minRows: 2, maxRows: 10 })

  // Carga inicial del contenido (una vez por montaje = por categoría).
  useEffect(() => {
    if (!loaded && query.data) {
      setText(query.data.content)
      setLoaded(true)
    }
  }, [loaded, query.data])

  const saved = query.data?.content ?? ''
  function persist() {
    if (loaded && text !== saved) {
      save.mutate({ month: monthKey, category, content: text })
    }
  }

  // Autoguardado con un respiro tras el último cambio.
  useEffect(() => {
    if (!loaded || text === saved) return
    const id = setTimeout(
      () => save.mutate({ month: monthKey, category, content: text }),
      800,
    )
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, loaded])

  return (
    <div className="relative">
      {query.isLoading && !loaded ? (
        <div className="space-y-2 pt-1" aria-hidden>
          <div className="h-3 w-3/4 rounded skeleton-shimmer" />
          <div className="h-3 w-2/3 rounded skeleton-shimmer" />
        </div>
      ) : query.isError && !loaded ? (
        // Carga inicial fallida: NO mostrar el textarea vacío (parecería "sin
        // notas todavía" cuando en realidad el fetch se rompió). Una vez cargado
        // el contenido, un refetch fallido no pisa lo que el usuario está editando.
        <ErrorState
          title="No se pudieron cargar las notas"
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={persist}
          rows={2}
          placeholder="Recordatorios o notas globales del mes…"
          aria-label="Notas del mes"
          className="w-full resize-none bg-transparent text-body text-ink-700 placeholder:text-ink-300 leading-relaxed"
        />
      )}
      {save.isPending && (
        <span className="absolute top-0 right-0 text-micro uppercase tracking-eyebrow text-ink-300">
          guardando…
        </span>
      )}
    </div>
  )
}
