import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type ErrorLogEntry } from '../../api'
import { LoadingHint } from '../LoadingHint'
import { dedupErrorEntries } from './settingsLogsModel'

export function LogsErrorList() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['errorLog'],
    queryFn: () => api.errorLog(100),
    staleTime: 30_000,
  })
  const [expandedId, setExpandedId] = useState<string | null>(null)
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
        {grouped.map((group) => (
          <ErrorRow
            key={group.representative.id}
            entry={group.representative}
            count={group.count}
            expanded={expandedId === group.representative.id}
            onToggle={() =>
              setExpandedId(
                expandedId === group.representative.id ? null : group.representative.id,
              )
            }
          />
        ))}
      </ul>
    </div>
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
          {count > 1 && (
            <span
              className="text-micro tabular-nums text-ink-400 px-1.5 py-0.5 bg-paper-100 rounded"
              title={`${count} ocurrencias del mismo error`}
            >
              {count}×
            </span>
          )}
        </div>

        <span className="flex-1 text-xs text-ink-500 truncate">{entry.message}</span>
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
