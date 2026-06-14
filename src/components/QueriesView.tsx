import { useState, type FormEvent } from 'react'
import { ViewHeader } from './ViewHeader'
import { ConsultasIcon } from './Icons'
import { Spinner } from './Spinner'
import { QueryResultList } from './queries/QueryResultList'
import {
  useAskQuery,
  useDeleteSavedQuery,
  useRunQuery,
  useSaveQuery,
  useSavedQueries,
} from '../state/useSavedQueries'
import type { QueryHit, QueryInput } from '../api/query'
import type { SavedQuery } from '../api/savedQueries'

/**
 * Vista "Consultas" (Fase 4) — pregúntale a tu trama en lenguaje natural, ve el
 * AST interpretado y los resultados en vivo, y guarda la consulta para reusarla
 * o embeberla como bloque en una nota.
 */
type ActiveResult = {
  query: QueryInput
  items: QueryHit[]
  source?: 'llm' | 'fallback'
  /** Nombre si proviene de una consulta guardada (oculta el guardar). */
  savedName?: string
}

/** Snippet de bloque embebible: una valla ```trama-query con el AST dentro. */
function embedSnippet(query: QueryInput): string {
  return '```trama-query\n' + JSON.stringify(query) + '\n```'
}

export function QueriesView() {
  const [q, setQ] = useState('')
  const [active, setActive] = useState<ActiveResult | null>(null)
  const [saveName, setSaveName] = useState('')
  const [copied, setCopied] = useState(false)

  const ask = useAskQuery()
  const run = useRunQuery()
  const saved = useSavedQueries()
  const save = useSaveQuery()
  const del = useDeleteSavedQuery()

  const busy = ask.isPending || run.isPending

  function submitAsk(e: FormEvent) {
    e.preventDefault()
    const text = q.trim()
    if (!text) return
    setCopied(false)
    ask.mutate(text, {
      onSuccess: (r) => setActive({ query: r.query, items: r.items, source: r.source }),
    })
  }

  function runSaved(sq: SavedQuery) {
    setCopied(false)
    run.mutate(sq.query, {
      onSuccess: (r) =>
        setActive({ query: sq.query, items: r.items, savedName: sq.name }),
    })
  }

  function doSave() {
    const name = saveName.trim()
    if (!active || !name) return
    save.mutate({ name, query: active.query }, { onSuccess: () => setSaveName('') })
  }

  async function copyEmbed() {
    if (!active) return
    try {
      await navigator.clipboard.writeText(embedSnippet(active.query))
      setCopied(true)
    } catch {
      /* navegador sin clipboard — no rompemos */
    }
  }

  const savedItems = saved.data?.items ?? []

  return (
    <div>
      <ViewHeader
        title="Consultas"
        eyebrow="pregúntale a tu trama"
        accent="var(--accent-primary)"
        icon={<ConsultasIcon size={22} />}
        subtitle="Escribe una pregunta en lenguaje natural. Trama la traduce a una consulta, te muestra cómo la interpretó y los resultados — guárdala para reusarla o embeberla en una nota."
      />

      <form onSubmit={submitAsk} className="flex items-start gap-2">
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submitAsk(e)
          }}
          rows={2}
          aria-label="Pregunta en lenguaje natural"
          placeholder="¿filósofos anteriores a 1900? · notas con #trabajo · citas de Borges…"
          className="flex-1 resize-none rounded-lg border border-ink-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-300 focus:border-ink-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="btn-ink text-sm shrink-0 disabled:opacity-50"
        >
          {ask.isPending ? <Spinner size={14} /> : 'Preguntar'}
        </button>
      </form>

      {(ask.isError || run.isError) && (
        <p className="mt-3 text-sm text-ink-500">
          No se pudo ejecutar la consulta. Intenta de nuevo.
        </p>
      )}

      {active && (
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-3">
            <h3 className="font-serif text-lg text-ink-700">
              {active.savedName ?? 'Resultados'}
            </h3>
            {active.source && (
              <span className="text-micro uppercase tracking-eyebrow text-ink-400">
                {active.source === 'llm'
                  ? 'interpretado por IA'
                  : 'búsqueda de texto libre'}
              </span>
            )}
          </div>

          <details className="mb-3 rounded-lg border border-ink-100 bg-ink-50/40 px-3 py-2">
            <summary className="cursor-pointer text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700">
              Ver consulta interpretada
            </summary>
            <pre className="mt-2 overflow-x-auto text-caption font-mono text-ink-600">
              {JSON.stringify(active.query, null, 2)}
            </pre>
          </details>

          {busy ? (
            <div className="py-6 flex justify-center">
              <Spinner size={20} />
            </div>
          ) : (
            <QueryResultList
              items={active.items}
              emptyHint="Sin resultados para esta consulta."
            />
          )}

          {/* Guardar / embeber: sólo cuando el resultado no proviene de una
              consulta ya guardada. */}
          {!active.savedName && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Nombre para guardar…"
                className="rounded-lg border border-ink-200 bg-paper-50 px-3 py-1.5 text-sm text-ink-800 placeholder:text-ink-300 focus:border-ink-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={doSave}
                disabled={!saveName.trim() || save.isPending}
                className="btn-ink text-sm disabled:opacity-50"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={copyEmbed}
                className="btn-ghost text-sm"
                title="Copia un bloque ```trama-query para pegar en una nota"
              >
                {copied ? 'Copiado ✓' : 'Copiar bloque embebible'}
              </button>
            </div>
          )}
        </section>
      )}

      {savedItems.length > 0 && (
        <section className="mt-10">
          <h3 className="mb-2 text-sm uppercase tracking-eyebrow text-ink-500">
            Consultas guardadas
          </h3>
          <ul className="space-y-1.5">
            {savedItems.map((sq) => (
              <li
                key={sq.id}
                className="flex items-center gap-3 rounded-lg border border-ink-100 bg-paper-50 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => runSaved(sq)}
                  className="min-w-0 flex-1 text-left text-sm text-ink-800 hover:text-ink-950 truncate"
                >
                  {sq.name}
                </button>
                <button
                  type="button"
                  onClick={() => del.mutate(sq)}
                  className="shrink-0 text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
