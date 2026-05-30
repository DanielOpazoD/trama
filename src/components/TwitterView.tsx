import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ViewHeader } from './ViewHeader'
import { CloseIcon, EndMark } from './Icons'
import { EmptyMessage } from './EmptyMessage'
import { useDeleteBookmark, useTwitterBookmarksQuery, useXStatusQuery } from '../state'
import { api, type XBookmark } from '../api'
import { formatRelative } from './settings/_shared'

/**
 * Vista Twitter — los tweets que marcaste como bookmark en X. Espejo de
 * Escuchas: superficie de lectura, NO de trama. Navegación por año/mes (sobre
 * la fecha del tweet) y borrado (soft-delete, no toca X). El agrupado por fecha
 * se hace client-side: a escala personal traer todo es lo más simple.
 *
 * La clasificación por tema (chips) la suma una PR posterior sobre esta base.
 */
function monthName(m: number): string {
  return new Date(2000, m, 1).toLocaleDateString('es', { month: 'long' })
}

export function TwitterView() {
  const queryClient = useQueryClient()
  const status = useXStatusQuery()
  const bookmarks = useTwitterBookmarksQuery()
  const del = useDeleteBookmark()
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [month, setMonth] = useState<number | null>(null)

  const items = useMemo(() => bookmarks.data?.items ?? [], [bookmarks.data])
  const data = status.data
  const connected = data?.connected === true
  const lastSyncedAt = data && data.connected ? data.lastSyncedAt : null

  // Facetas año → meses (con conteo), derivadas de la fecha del tweet.
  const byYear = useMemo(() => {
    const map = new Map<number, { count: number; months: Map<number, number> }>()
    for (const b of items) {
      if (!b.tweetCreatedAt) continue
      const d = new Date(b.tweetCreatedAt)
      const y = d.getFullYear()
      const m = d.getMonth()
      const entry = map.get(y) ?? { count: 0, months: new Map<number, number>() }
      entry.count += 1
      entry.months.set(m, (entry.months.get(m) ?? 0) + 1)
      map.set(y, entry)
    }
    return map
  }, [items])
  const years = useMemo(() => [...byYear.keys()].sort((a, b) => b - a), [byYear])
  const months = useMemo(() => {
    if (year == null) return []
    const ms = byYear.get(year)?.months
    if (!ms) return []
    return [...ms.keys()].sort((a, b) => b - a)
  }, [byYear, year])

  const filtered = useMemo(() => {
    if (year == null) return items
    return items.filter((b) => {
      if (!b.tweetCreatedAt) return false
      const d = new Date(b.tweetCreatedAt)
      if (d.getFullYear() !== year) return false
      if (month != null && d.getMonth() !== month) return false
      return true
    })
  }, [items, year, month])

  function selectYear(y: number | null) {
    setYear((prev) => (prev === y ? null : y))
    setMonth(null)
  }

  async function handleSync() {
    setSyncing(true)
    setMessage(null)
    try {
      const r = await api.xSync()
      setMessage(
        r.inserted > 0 ? `${r.inserted} bookmarks nuevos` : 'Sin bookmarks nuevos',
      )
      queryClient.invalidateQueries({ queryKey: ['x'] })
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  function handleDelete(b: XBookmark) {
    if (!confirm('¿Quitar este bookmark de Trama? No se borra de tu cuenta de X.')) {
      return
    }
    del.mutate(b.id)
  }

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors ${
      active
        ? 'bg-ink-100 text-ink-800'
        : 'text-ink-400 hover:bg-ink-100/60 hover:text-ink-700'
    }`

  return (
    <>
      <ViewHeader
        title="Twitter"
        eyebrow="tus marcadores"
        accent="var(--accent-primary)"
        eyebrowColor="var(--accent-gold)"
        spacing="wide"
        subtitle="Los tweets que marcaste como bookmark en X. Viven aparte — nada entra a tu trama hasta que lo decidas."
        action={
          connected ? (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
              >
                {syncing ? 'sincronizando…' : 'Sincronizar'}
              </button>
              <span className="text-micro text-ink-300 tabular-nums">
                {lastSyncedAt
                  ? `sincronizado ${formatRelative(lastSyncedAt)}`
                  : 'sin sincronizar'}
              </span>
            </div>
          ) : undefined
        }
      />

      {message && (
        <p className="mb-6 text-xs text-ink-500 italic animate-fade-up">{message}</p>
      )}

      {status.isLoading || bookmarks.isLoading ? (
        <p className="text-xs text-ink-300 italic">cargando…</p>
      ) : !connected ? (
        <EmptyMessage
          illustration="thread"
          title="X no está conectado"
          body="Conectá tu cuenta de X en Configuración → X (Twitter) para traer tus tweets marcados."
        />
      ) : items.length === 0 ? (
        <EmptyMessage
          illustration="thread"
          title="Sin bookmarks todavía"
          body="Marcá tweets como bookmark en X y sincronizá para verlos acá."
          action={
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-accent text-xs disabled:opacity-50"
            >
              {syncing ? 'sincronizando…' : 'Sincronizar ahora'}
            </button>
          }
        />
      ) : (
        <>
          {/* Navegación por año (y mes al elegir un año) — sobre la fecha del tweet. */}
          {years.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <button onClick={() => selectYear(null)} className={chip(year == null)}>
                Todos
              </button>
              {years.map((y) => (
                <button
                  key={y}
                  onClick={() => selectYear(y)}
                  className={chip(year === y)}
                >
                  {y}
                  <span className="ml-1 text-micro text-ink-300 tabular-nums">
                    {byYear.get(y)?.count}
                  </span>
                </button>
              ))}
            </div>
          )}
          {year != null && months.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-1.5 border-l-2 border-ink-100 pl-3">
              <button onClick={() => setMonth(null)} className={chip(month == null)}>
                Todo {year}
              </button>
              {months.map((m) => (
                <button
                  key={m}
                  onClick={() => setMonth((prev) => (prev === m ? null : m))}
                  className={chip(month === m)}
                >
                  {monthName(m)}
                </button>
              ))}
            </div>
          )}

          <ul className="space-y-4">
            {filtered.map((b) => (
              <li key={b.id} className="group relative card-paper-soft p-4">
                <button
                  onClick={() => handleDelete(b)}
                  disabled={del.isPending}
                  aria-label="Quitar bookmark"
                  title="Quitar de Trama (no borra de X)"
                  className="absolute right-2 top-2 rounded p-1 text-ink-300 opacity-0 transition-opacity hover:bg-ink-50 hover:text-red-700 group-hover:opacity-100 disabled:opacity-50"
                >
                  <CloseIcon size={12} />
                </button>
                <div className="flex items-baseline justify-between gap-3 pr-6">
                  <span className="min-w-0 truncate text-sm text-ink-700">
                    {b.authorName ?? 'desconocido'}
                    {b.authorUsername && (
                      <span className="text-ink-400"> @{b.authorUsername}</span>
                    )}
                  </span>
                  {b.tweetCreatedAt && (
                    <span className="shrink-0 text-micro text-ink-300 tabular-nums">
                      {new Date(b.tweetCreatedAt).toLocaleDateString('es', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">
                  {b.text}
                </p>
                {b.url && (
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-micro hover:underline"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    ver en X ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex justify-center">
            <EndMark />
          </div>
        </>
      )}
    </>
  )
}
