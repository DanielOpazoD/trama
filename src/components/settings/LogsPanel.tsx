import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type ErrorLogEntry, type ExtractionLogEntry } from '../../api'
import { LoadingHint } from '../LoadingHint'
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
      <div className="card-segment flex gap-2">
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

  // ρ-micro: agrupamos errores idénticos para que un bug recurrente no
  // contamine la lista. El "representante" del grupo es el entry más
  // reciente (su stack es el que se ve al expandir). El conteo aparece
  // como badge.
  //
  // Importante: el useMemo va ANTES de los early returns por rules-of-hooks.
  // Si data aún no llegó usamos []; el resultado solo se consume después
  // de pasar los checks de loading/error/empty.
  const grouped = useMemo(() => dedupErrorEntries(data ?? []), [data])

  if (isLoading) {
    return <LoadingHint text="cargando" />
  }
  if (error || !data) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-[color:var(--accent-clay)]">
          No se pudo cargar el log de errores.
        </p>
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

  const totalUnique = grouped.length
  const totalRaw = data.length

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="section-eyebrow tabular-nums">
          {totalUnique} {totalUnique === 1 ? 'patrón' : 'patrones'}
          {totalRaw !== totalUnique && (
            <span className="text-ink-300"> · {totalRaw} eventos</span>
          )}
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
        {grouped.map((g) => (
          <ErrorRow
            key={g.representative.id}
            entry={g.representative}
            count={g.count}
            expanded={expandedId === g.representative.id}
            onToggle={() =>
              setExpandedId(
                expandedId === g.representative.id ? null : g.representative.id,
              )
            }
          />
        ))}
      </ul>
    </div>
  )
}

/**
 * ρ-micro: agrupa errores con misma function + same first 200 chars del
 * message. El representante es el más reciente — su stack es el que se
 * muestra al expandir.
 */
function dedupErrorEntries(
  entries: ErrorLogEntry[],
): Array<{ representative: ErrorLogEntry; count: number }> {
  const groups = new Map<string, { representative: ErrorLogEntry; count: number }>()
  for (const e of entries) {
    const key = `${e.functionName}|${e.statusCode ?? 'NA'}|${e.message.slice(0, 200)}`
    const existing = groups.get(key)
    if (existing) {
      existing.count += 1
      if (e.createdAt > existing.representative.createdAt) {
        existing.representative = e
      }
    } else {
      groups.set(key, { representative: e, count: 1 })
    }
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.representative.createdAt < b.representative.createdAt ? 1 : -1,
  )
}

function ErrorRow({
  entry,
  count = 1,
  expanded,
  onToggle,
}: {
  entry: ErrorLogEntry
  count?: number
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
                  ? 'bg-[color:var(--accent-clay-soft)] text-[color:var(--accent-clay)]'
                  : entry.statusCode >= 400
                    ? 'bg-[color:var(--accent-warn-soft)] text-[color:var(--accent-warn)]'
                    : 'bg-ink-100 text-ink-600'
              }`}
            >
              {entry.statusCode}
            </span>
          )}
          <span className="text-xs text-ink-600 font-medium font-mono">
            {entry.functionName}
          </span>
          {/* ρ-micro: count del patrón de error si está agrupado. */}
          {count > 1 && (
            <span
              className="text-micro tabular-nums text-ink-400 px-1.5 py-0.5 bg-paper-100 rounded"
              title={`${count} ocurrencias del mismo error`}
            >
              {count}×
            </span>
          )}
        </div>

        {/* message preview — truncado en una línea */}
        <span className="flex-1 text-xs text-ink-500 truncate">{entry.message}</span>

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
          <p className="text-caption text-ink-700 whitespace-pre-wrap break-words font-mono leading-relaxed">
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

  if (isLoading) return <LoadingHint text="cargando" />
  if (error || !data) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-[color:var(--accent-clay)]">
          No se pudo cargar el log de IA.
        </p>
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
          <div className="mt-1 section-eyebrow">llamadas</div>
        </div>
        <div>
          <div className="text-xl font-serif text-ink-800 tabular-nums leading-none">
            USD {totalCostEur}
          </div>
          <div className="mt-1 section-eyebrow">costo total</div>
        </div>
        <div>
          <div className="text-xl font-serif text-ink-800 tabular-nums leading-none">
            {data.totals.totalTokens.toLocaleString('es')}
          </div>
          <div className="mt-1 section-eyebrow">tokens</div>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <p className="section-eyebrow tabular-nums">
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
          <span className="text-xs text-ink-400 font-mono truncate">{entry.model}</span>
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
            className="text-micro font-mono px-1.5 py-0.5 rounded bg-[color:var(--accent-clay-soft)] text-[color:var(--accent-clay)] shrink-0"
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
              <p className="section-eyebrow mb-1">error</p>
              <p className="text-caption text-[color:var(--accent-clay)] whitespace-pre-wrap break-words font-mono leading-relaxed">
                {entry.error}
              </p>
            </div>
          )}
          {hasInput && (
            <div>
              <p className="section-eyebrow mb-1">input</p>
              <p className="text-caption text-ink-700 whitespace-pre-wrap break-words font-serif italic leading-relaxed bg-paper-50 border border-ink-100/60 rounded p-2 max-h-32 overflow-y-auto">
                {entry.inputText}
              </p>
            </div>
          )}
          {hasProposal && (
            <div>
              <p className="section-eyebrow mb-1">propuesta (json)</p>
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
