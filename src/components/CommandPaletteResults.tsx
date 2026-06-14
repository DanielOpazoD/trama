import { useState, type FormEvent } from 'react'
import type { QueryHit, QueryInput } from '../api/query'

/**
 * UI del modo "resultados" del command palette unificado. Vive en su propio
 * módulo (lazy) para no engordar el bundle inicial del palette: el camino
 * común (buscar/navegar) no necesita el motor de consultas.
 *
 * Reusa el estilo de fila de `QueryResultList`, pero las filas son
 * SELECCIONABLES (click + navegación por teclado desde el padre), por eso no
 * delegamos a ese componente estático.
 */

const KIND_LABEL: Record<QueryHit['kind'], string> = {
  entity: 'Entidad',
  quote: 'Cita',
  momento: 'Momento',
  note: 'Nota',
}

export function CommandPaletteResults({
  hits,
  ast,
  source,
  heading,
  focusIdx,
  onFocusIdx,
  onSelectHit,
  onBack,
  onSave,
  saving,
}: {
  hits: QueryHit[]
  ast: QueryInput | null
  source?: 'llm' | 'fallback'
  heading: string
  focusIdx: number
  onFocusIdx: (idx: number) => void
  onSelectHit: (hit: QueryHit) => void
  onBack: () => void
  /** Guardar la consulta con un nombre. Solo se ofrece si hay AST. */
  onSave: (name: string) => void
  saving: boolean
}) {
  const [saveName, setSaveName] = useState('')

  function submitSave(e: FormEvent) {
    e.preventDefault()
    const name = saveName.trim()
    if (!name || !ast) return
    onSave(name)
    setSaveName('')
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto">
      <div className="px-5 pt-4 pb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
        >
          ← volver a buscar
        </button>
        <h3 className="font-serif text-lg text-ink-700 truncate flex-1">{heading}</h3>
      </div>

      {ast && (
        <details className="mx-5 mb-2 rounded-lg border border-ink-100 bg-ink-50/40 px-3 py-1.5">
          <summary className="cursor-pointer text-micro uppercase tracking-eyebrow text-ink-400 hover:text-ink-700">
            interpretado como…
            {source === 'fallback' && (
              <span className="ml-2 normal-case tracking-normal text-ink-400 italic">
                búsqueda de texto (la IA no estaba disponible)
              </span>
            )}
          </summary>
          <pre className="mt-2 overflow-x-auto text-caption font-mono text-ink-600">
            {JSON.stringify(ast, null, 2)}
          </pre>
        </details>
      )}

      {hits.length === 0 ? (
        <p className="px-5 py-6 text-ink-400 italic text-sm text-center">
          Sin resultados para esta consulta.
        </p>
      ) : (
        <ul className="px-3">
          {hits.map((hit, idx) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                onClick={() => onSelectHit(hit)}
                onMouseEnter={() => onFocusIdx(idx)}
                className={`w-full text-left flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                  idx === focusIdx ? 'bg-paper-100/70' : 'hover:bg-paper-100/40'
                }`}
              >
                <span className="mt-0.5 shrink-0 text-micro uppercase tracking-eyebrow text-ink-400">
                  {KIND_LABEL[hit.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink-800 truncate">
                    {hit.title ?? '(sin título)'}
                  </span>
                  {hit.snippet && (
                    <span className="block text-xs text-ink-500 line-clamp-2">
                      {hit.snippet}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {ast && (
        <form
          onSubmit={submitSave}
          className="mx-5 my-3 flex flex-wrap items-center gap-2"
        >
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="nombre de la consulta"
            className="flex-1 min-w-0 rounded-lg border border-ink-200 bg-paper-50 px-3 py-1.5 text-sm text-ink-800 placeholder:text-ink-300 focus:border-ink-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!saveName.trim() || saving}
            className="btn-ink text-sm shrink-0 disabled:opacity-50"
          >
            Guardar consulta
          </button>
        </form>
      )}
    </div>
  )
}
