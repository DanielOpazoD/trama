import { useEffect, useState } from 'react'
import { useMonthNoteQuery, useSaveMonthNote } from '../../state'

/**
 * Notas globales del mes (Tareas) — un cuadro de texto libre al lado del
 * navegador. Se guarda solo: con un respiro tras dejar de escribir y al salir
 * del campo. El padre la monta con key={monthKey} para refrescar al cambiar de
 * mes.
 */
export function MonthNotes({ monthKey, label }: { monthKey: string; label: string }) {
  const query = useMonthNoteQuery(monthKey)
  const save = useSaveMonthNote()
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)

  // Carga inicial del contenido del mes (una vez por montaje).
  useEffect(() => {
    if (!loaded && query.data) {
      setText(query.data.content)
      setLoaded(true)
    }
  }, [loaded, query.data])

  const saved = query.data?.content ?? ''
  function persist() {
    if (loaded && text !== saved) save.mutate({ month: monthKey, content: text })
  }

  // Autoguardado con un respiro tras el último cambio.
  useEffect(() => {
    if (!loaded || text === saved) return
    const id = setTimeout(() => save.mutate({ month: monthKey, content: text }), 800)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, loaded])

  return (
    <div className="card-paper-soft rounded-xl border border-ink-100/70 p-4 flex flex-col h-full">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="section-eyebrow text-ink-400">Notas de {label}</span>
        {save.isPending && (
          <span className="text-micro uppercase tracking-eyebrow text-ink-300">
            guardando…
          </span>
        )}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={persist}
        placeholder="Recordatorios o notas globales del mes…"
        className="flex-1 min-h-[7.5rem] w-full resize-none bg-transparent text-sm text-ink-700 placeholder:text-ink-300 leading-relaxed"
      />
    </div>
  )
}
