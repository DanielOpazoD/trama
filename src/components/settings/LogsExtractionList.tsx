import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MetricTile } from '../MetricTile'
import { api, type ExtractionLogEntry } from '../../api'
import { LoadingHint } from '../LoadingHint'

export function LogsExtractionList() {
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
      {/* El mismo MetricTile del resto de la app — este strip era una de las
          cuatro reimplementaciones del gesto número+etiqueta. */}
      <div className="grid grid-cols-3 gap-2">
        <MetricTile label="llamadas" value={data.totals.totalCalls} />
        <MetricTile label="costo total" value={`USD ${totalCostEur}`} />
        <MetricTile label="tokens" value={data.totals.totalTokens.toLocaleString('es')} />
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
        {data.entries.map((entry) => (
          <ExtractionRow
            key={entry.id}
            entry={entry}
            expanded={expandedId === entry.id}
            onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
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
        <div className="flex items-baseline gap-1.5 shrink-0 min-w-0">
          <span className="text-xs text-ink-600 font-medium font-mono truncate">
            {entry.provider}
          </span>
          <span className="text-ink-300 text-xs">·</span>
          <span className="text-xs text-ink-400 font-mono truncate">{entry.model}</span>
        </div>

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
