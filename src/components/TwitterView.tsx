import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ViewHeader } from './ViewHeader'
import { EmptyMessage } from './EmptyMessage'
import { EndMark } from './Icons'
import { useTwitterBookmarksQuery, useXStatusQuery } from '../state'
import { api } from '../api'
import { formatRelative } from './settings/_shared'

/**
 * Vista Twitter — los tweets que marcaste como bookmark en X, traídos por el
 * sync. Espejo de Escuchas: superficie de lectura, NO de trama. Nada entra al
 * mapa hasta que el usuario lo decida (igual criterio que Spotify).
 *
 * La conexión y la app de X se gestionan en Configuración → X; acá solo se
 * muestran los bookmarks guardados y se puede disparar un sync manual.
 */
export function TwitterView() {
  const queryClient = useQueryClient()
  const status = useXStatusQuery()
  const bookmarks = useTwitterBookmarksQuery()
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const items = bookmarks.data?.pages.flatMap((p) => p.items) ?? []
  const data = status.data
  const connected = data?.connected === true
  const lastSyncedAt = data && data.connected ? data.lastSyncedAt : null

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
          <ul className="space-y-4">
            {items.map((b) => (
              <li key={b.id} className="card-paper-soft p-4">
                <div className="flex items-baseline justify-between gap-3">
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
          {bookmarks.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => bookmarks.fetchNextPage()}
                disabled={bookmarks.isFetchingNextPage}
                className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
              >
                {bookmarks.isFetchingNextPage ? 'cargando…' : 'cargar más'}
              </button>
            </div>
          ) : (
            <div className="mt-8 flex justify-center">
              <EndMark />
            </div>
          )}
        </>
      )}
    </>
  )
}
