import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { PanelHeader, formatRelative } from './_shared'

export function SpotifyPanel() {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const spotifyStatus = useQuery({
    queryKey: ['spotify', 'status'],
    queryFn: () => api.spotifyStatus(),
    retry: false,
  })

  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(t)
  }, [message])

  async function handleSync() {
    setBusy(true); setMessage(null)
    try {
      const r = await api.spotifySync()
      setMessage(`Sincronizado: ${r.inserted} reproducciones nuevas`)
      queryClient.invalidateQueries({ queryKey: ['spotify'] })
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al sincronizar')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Spotify? Las reproducciones guardadas se mantienen, solo se cierra la sesión.')) {
      return
    }
    setBusy(true); setMessage(null)
    try {
      await api.spotifyDisconnect()
      setMessage('Spotify desconectado')
      queryClient.invalidateQueries({ queryKey: ['spotify'] })
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al desconectar')
    } finally {
      setBusy(false)
    }
  }

  const spotify = spotifyStatus.data

  return (
    <section>
      <PanelHeader
        title="Spotify"
        hint="Trama puede registrar lo que escuchás en Spotify para que luego decidas qué entra al mapa. Lo registrado vive aparte — nada entra a la trama sin que tú lo apruebes."
      />
      {spotifyStatus.isLoading ? (
        <p className="text-xs text-ink-300 italic">cargando…</p>
      ) : spotify && spotify.connected ? (
        <div className="space-y-3 p-4 bg-paper-100/40 rounded-lg border border-ink-100/50">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-ink-700">
              Conectado como{' '}
              <strong className="font-medium">
                {spotify.displayName ?? spotify.spotifyUserId ?? 'tu cuenta'}
              </strong>
            </p>
            <span className="text-micro text-ink-400 tabular-nums">
              {formatRelative(spotify.lastSyncedAt)}
            </span>
          </div>
          <div className="flex gap-3 text-xs text-ink-400 tabular-nums">
            <span>{spotify.counts.totalPlays} reproducciones</span>
            <span>·</span>
            <span>{spotify.counts.uniqueTracks} canciones únicas</span>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSync}
              disabled={busy}
              className="text-xs px-3 py-1.5 border border-ink-100/60 rounded-md hover:bg-ink-50 transition-all disabled:opacity-50"
            >
              Sincronizar ahora
            </button>
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="text-xs px-3 py-1.5 text-ink-400 hover:text-red-700 transition-colors ml-auto"
            >
              Desconectar
            </button>
          </div>
        </div>
      ) : (
        <a
          href="/api/spotify/login"
          className="inline-block text-sm px-3 py-2 border border-ink-100/60 rounded-lg hover:bg-ink-50 transition-all"
        >
          Conectar con Spotify
        </a>
      )}
      {message && (
        <p className="mt-3 text-xs text-ink-500 italic animate-fade-up">{message}</p>
      )}
    </section>
  )
}
