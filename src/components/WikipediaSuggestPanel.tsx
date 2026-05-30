import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, type WikipediaSuggestion } from '../api'
import { queryKeys } from '../state/queryClient'
import { typeAccent } from './graph/GraphNode'

/**
 * Panel de revisión de sugerencias de Wikipedia. Para cada entidad sin enlace,
 * el server propuso el artículo que mejor matchea su nombre — pero el match por
 * nombre es ambiguo, así que NADA se asigna solo: el usuario revisa cada
 * sugerencia y la acepta o la descarta.
 *
 * El estado (busy, hechas) se indexa por entityId, no por índice posicional —
 * así resolver una fila no descoloca al resto.
 */
export function WikipediaSuggestPanel({
  suggestions: initial,
  remaining,
  onClose,
}: {
  suggestions: WikipediaSuggestion[]
  remaining: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function assign(s: WikipediaSuggestion) {
    if (!s.match) return
    setBusy(s.entityId)
    setError(null)
    try {
      await api.updateEntity(s.entityId, { wikipediaUrl: s.match.url })
      queryClient.invalidateQueries({ queryKey: queryKeys.entities })
      setRows((prev) => prev.filter((x) => x.entityId !== s.entityId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar el enlace')
    } finally {
      setBusy(null)
    }
  }

  function dismiss(s: WikipediaSuggestion) {
    setRows((prev) => prev.filter((x) => x.entityId !== s.entityId))
  }

  if (rows.length === 0) {
    return (
      <div className="card-paper-soft mb-6 flex items-center justify-between gap-3 px-4 py-3 text-sm text-ink-500">
        <span>No quedan sugerencias de Wikipedia.</span>
        <button onClick={onClose} className="btn-ghost text-xs">
          cerrar
        </button>
      </div>
    )
  }

  const withMatch = rows.filter((s) => s.match)

  return (
    <div className="card-paper mb-6 p-4 animate-fade-up">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="section-eyebrow-serif">
          {withMatch.length === 1
            ? 'Sugerencia de Wikipedia'
            : `${withMatch.length} sugerencias de Wikipedia`}
        </h3>
        <button onClick={onClose} className="btn-ghost text-xs">
          cerrar
        </button>
      </div>
      <p className="mb-2 text-micro text-ink-400">
        El match por nombre es ambiguo — revisá cada artículo antes de asignarlo.
        {remaining && ' Quedan más entidades sin enlace; corré de nuevo para seguir.'}
      </p>
      {error && <p className="alert-error mb-2 rounded-lg px-3 py-2 text-sm">{error}</p>}
      <ul className="space-y-4">
        {rows.map((s) => (
          <li key={s.entityId} className="border-l-2 border-ink-200/70 pl-3">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-ink-700">{s.entityName}</span>
              <span
                className="text-micro uppercase tracking-eyebrow"
                style={{ color: typeAccent(s.entityType) }}
              >
                {s.entityType}
              </span>
            </div>
            {s.match ? (
              <>
                <a
                  href={s.match.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block text-sm hover:underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {s.match.title} ↗
                </a>
                {s.match.description && (
                  <p className="text-micro text-ink-400">{s.match.description}</p>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => assign(s)}
                    disabled={busy === s.entityId}
                    className="btn-accent text-xs disabled:opacity-50"
                    title="Asigna este artículo de Wikipedia a la entidad"
                  >
                    {busy === s.entityId ? 'asignando…' : 'Asignar enlace'}
                  </button>
                  <button onClick={() => dismiss(s)} className="btn-ghost text-xs">
                    descartar
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-micro text-ink-400">
                  sin resultado en Wikipedia
                </span>
                <button onClick={() => dismiss(s)} className="btn-ghost text-xs">
                  descartar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
