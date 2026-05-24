import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type ErrorLogEntry, type ExtractionLogEntry } from '../../api'
import { PanelHeader } from './_shared'

/**
 * ε4: Panel "Logs" — UIs para error_log y extraction_log que el HealthPanel
 * solo resumía. Aquí puedes ver:
 *   - errores históricos con stack trace expandible
 *   - cada llamada al LLM con costo/tokens/duración
 *
 * Dos sub-tabs internos. Stack traces colapsados por default (ocupan
 * mucho); click para expandir. Refresh manual con botón — no auto-poll
 * porque estos logs no son críticos en tiempo real.
 */

export function LogsPanel() {
  const [view, setView] = useState<'errors' | 'extractions'>('errors')

  return (
    <section className="space-y-6">
      <PanelHeader
        title="Logs"
        hint="Historial de errores y llamadas a IA. Para diagnóstico cuando algo no se comportó como esperabas."
      />

      {/* Sub-tabs internas */}
      <div className="flex gap-2 p-1 bg-paper-100/60 rounded-lg border border-ink-100/50 w-fit">
        <button
          onClick={() => setView('errors')}
          className={`px-3 py-1.5 rounded text-sm transition-all duration-150 ${
            view === 'errors'
              ? 'bg-paper-50 text-ink-700 shadow-sm'
              : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          Errores
        </button>
        <button
          onClick={() => setView('extractions')}
          className={`px-3 py-1.5 rounded text-sm transition-all duration-150 ${
            view === 'extractions'
              ? 'bg-paper-50 text-ink-700 shadow-sm'
              : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          Llamadas IA
        </button>
      </div>

      {view === 'errors' ? <ErrorList /> : <ExtractionList />}
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   Errores — listado con stack trace expandible por item.
   ───────────────────────────────────────────────────────────────────── */

function ErrorList() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['errorLog'],
    queryFn: () => api.errorLog(100),
    staleTime: 30_000,
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) {
    return <p className="text-xs text-ink-300 italic">cargando…</p>
  }
  if (error || !data) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-red-700">No se pudo cargar el log de errores.</p>
        <button
          onClick={() => refetch()}
          className="text-xs px-3 py-1.5 border border-ink-100/60 rounded-md hover:bg-ink-50 transition-all"
        >
          reintentar
        </button>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="card-paper p-6 text-center">
        <p className="text-sm text-ink-400 italic">
          Sin errores registrados. La trama corre estable.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400 tabular-nums">
          {data.length} {data.length === 1 ? 'error' : 'errores'} · histórico
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
        >
          {isFetching ? 'recargando…' : 'recargar'}
        </button>
      </div>
      <ul className="space-y-2">
        {data.map((e) => (
          <ErrorRow
            key={e.id}
            entry={e}
            expanded={expandedId === e.id}
            onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
          />
        ))}
      </ul>
    </div>
  )
}

function ErrorRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: ErrorLogEntry
  expanded: boolean
  onToggle: () => void
}) {
  const hasStack = entry.stack && entry.stack.trim().length > 0

  return (
    <li className="card-paper overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2 flex items-baseline gap-3 hover:bg-paper-100/50 transition-colors"
        aria-expanded={expanded}
      >
        {/* status / function */}
        <div className="flex items-baseline gap-2 shrink-0">
          {entry.statusCode && (
            <span
              className={`text-micro font-mono tabular-nums px-1.5 py-0.5 rounded ${
                entry.statusCode >= 500
                  ? 'bg-red-100 text-red-800'
                  : entry.statusCode >= 400
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-ink-100 text-ink-600'
              }`}
            >
              {entry.statusCode}
            </span>
          )}
          <span className="text-xs text-ink-600 font-medium font-mono">
            {entry.functionName}
          </span>
        </div>

        {/* message preview — truncado en una línea */}
        <span className="flex-1 text-xs text-ink-500 truncate">
          {entry.message}
        </span>

        {/* timestamp y caret */}
        <span className="text-micro text-ink-400 tabular-nums shrink-0">
          {new Date(entry.createdAt).toLocaleString('es', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        {hasStack && (
          <span className="text-ink-300 text-xs shrink-0" aria-hidden>
            {expanded ? '−' : '+'}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-ink-100/60 px-3 py-2 space-y-2 bg-paper-100/30 animate-fade-up">
          {entry.httpPath && (
            <p className="text-micro text-ink-400 font-mono">
              {entry.httpMethod ?? 'GET'} {entry.httpPath}
            </p>
          )}
          <p className="text-xs text-ink-700 whitespace-pre-wrap break-words font-mono leading-relaxed">
            {entry.message}
          </p>
          {hasStack && (
            <pre className="text-micro text-ink-400 whitespace-pre-wrap break-words font-mono leading-relaxed bg-paper-50 border border-ink-100/60 rounded p-2 overflow-x-auto max-h-64 overflow-y-auto">
              {entry.stack}
            </pre>
          )}
        </div>
      )}
    </li>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   Extraction log — llamadas al LLM con tokens, costo y duración.
   ───────────────────────────────────────────────────────────────────── */

function ExtractionList() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['extractionLog'],
    queryFn: () => api.extractionLog(50),
    staleTime: 30_000,
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) return <p className="text-xs text-ink-300 italic">cargando…</p>
  if (error || !data) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-red-700">No se pudo cargar el log de IA.</p>
        <button
          onClick={() => refetch()}
          className="text-xs px-3 py-1.5 border border-ink-100/60 rounded-md hover:bg-ink-50 transition-all"
        >
          reintentar
        </button>
      </div>
    )
  }

  if (data.entries.length === 0) {
    return (
      <div className="card-paper p-6 text-center">
        <p className="text-sm text-ink-400 italic">
          Sin llamadas a IA registradas todavía.
        </p>
      </div>
    )
  }

  const totalCostEur = (data.totals.totalCostCents / 100).toFixed(3)

  return (
    <div className="space-y-3">
      {/* Totals strip */}
      <div className="card-paper p-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xl font-serif text-ink-800 tabular-nums leading-none">
            {data.totals.totalCalls}
          </div>
          <div className="mt-1 text-micro uppercase tracking-eyebrow text-ink-400">
            llamadas
          </div>
        </div>
        <div>
          <div className="text-xl font-serif text-ink-800 tabular-nums leading-none">
            USD {totalCostEur}
          </div>
          <div className="mt-1 text-micro uppercase tracking-eyebrow text-ink-400">
            costo total
          </div>
        </div>
        <div>
          <div className="text-xl font-serif text-ink-800 tabular-nums leading-none">
            {data.totals.totalTokens.toLocaleString('es')}
          </div>
          <div className="mt-1 text-micro uppercase tracking-eyebrow text-ink-400">
            tokens
          </div>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <p className="text-micro uppercase tracking-eyebrow text-ink-400 tabular-nums">
          {data.entries.length} últimas llamadas
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
        >
          {isFetching ? 'recargando…' : 'recargar'}
        </button>
      </div>

      <ul className="space-y-2">
        {data.entries.map((e) => (
          <ExtractionRow
            key={e.id}
            entry={e}
            expanded={expandedId === e.id}
            onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
          />
        ))}
      </ul>
    </div>
  )
}

function ExtractionRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: ExtractionLogEntry
  expanded: boolean
  onToggle: () => void
}) {
  const hasInput = entry.inputText && entry.inputText.trim().length > 0
  const hasProposal = entry.proposal !== null && entry.proposal !== undefined
  const costEur = (entry.costCents / 100).toFixed(4)

  return (
    <li className="card-paper overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2 flex items-baseline gap-3 hover:bg-paper-100/50 transition-colors"
        aria-expanded={expanded}
      >
        {/* provider · model */}
        <div className="flex items-baseline gap-1.5 shrink-0 min-w-0">
          <span className="text-xs text-ink-600 font-medium font-mono truncate">
            {entry.provider}
          </span>
          <span className="text-ink-300 text-xs">·</span>
          <span className="text-xs text-ink-400 font-mono truncate">
            {entry.model}
          </span>
        </div>

        {/* metrics */}
        <div className="flex items-baseline gap-3 ml-auto text-micro text-ink-400 tabular-nums shrink-0">
          <span>{entry.tokensIn.toLocaleString('es')}↓</span>
          <span>{entry.tokensOut.toLocaleString('es')}↑</span>
          <span>USD {costEur}</span>
          <span>{entry.durationMs}ms</span>
        </div>

        <span className="text-micro text-ink-400 tabular-nums shrink-0">
          {new Date(entry.createdAt).toLocaleString('es', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>

        {entry.error && (
          <span
            className="text-micro font-mono px-1.5 py-0.5 rounded bg-red-100 text-red-800 shrink-0"
            title={entry.error}
          >
            ERR
          </span>
        )}

        <span className="text-ink-300 text-xs shrink-0" aria-hidden>
          {expanded ? '−' : '+'}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-ink-100/60 px-3 py-2 space-y-3 bg-paper-100/30 animate-fade-up">
          {entry.error && (
            <div>
              <p className="text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
                error
              </p>
              <p className="text-xs text-red-700 whitespace-pre-wrap break-words font-mono leading-relaxed">
                {entry.error}
              </p>
            </div>
          )}
          {hasInput && (
            <div>
              <p className="text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
                input
              </p>
              <p className="text-xs text-ink-700 whitespace-pre-wrap break-words font-serif italic leading-relaxed bg-paper-50 border border-ink-100/60 rounded p-2 max-h-32 overflow-y-auto">
                {entry.inputText}
              </p>
            </div>
          )}
          {hasProposal && (
            <div>
              <p className="text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
                propuesta (json)
              </p>
              <pre className="text-micro text-ink-500 whitespace-pre-wrap break-words font-mono leading-relaxed bg-paper-50 border border-ink-100/60 rounded p-2 max-h-64 overflow-y-auto">
                {JSON.stringify(entry.proposal, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
