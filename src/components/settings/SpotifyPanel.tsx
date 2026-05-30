import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { describeOAuthReturn, type OAuthReturn } from '../../lib/oauthReturn'
import { PanelHeader, formatRelative } from './_shared'

export function SpotifyPanel({ oauthReturn }: { oauthReturn?: OAuthReturn | null }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

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

  // Al volver del OAuth: mostrar resultado y, si conectó, refrescar el estado.
  useEffect(() => {
    if (!oauthReturn) return
    setNotice(describeOAuthReturn(oauthReturn))
    if (oauthReturn.ok) queryClient.invalidateQueries({ queryKey: ['spotify'] })
  }, [oauthReturn, queryClient])

  async function handleSync() {
    setBusy(true)
    setMessage(null)
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

  async function handleConnect() {
    setBusy(true)
    setMessage(null)
    try {
      // Pedimos la authorize URL autenticados (el server setea una cookie con
      // el userId para el callback). Luego navegamos a Spotify.
      const { url } = await api.spotifyLogin()
      if (url) {
        window.location.href = url
        return
      }
      setMessage('Spotify no está disponible en este modo.')
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al conectar')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (
      !confirm(
        '¿Desconectar Spotify? Las reproducciones guardadas se mantienen, solo se cierra la sesión.',
      )
    ) {
      return
    }
    setBusy(true)
    setMessage(null)
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
      {notice && (
        <p
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            notice.ok ? 'bg-paper-100/60 text-ink-600' : 'alert-error'
          }`}
        >
          {notice.text}
        </p>
      )}
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
        <button
          onClick={handleConnect}
          disabled={busy}
          className="inline-block text-sm px-3 py-2 border border-ink-100/60 rounded-lg hover:bg-ink-50 transition-all disabled:opacity-50"
        >
          Conectar con Spotify
        </button>
      )}
      {message && (
        <p className="mt-3 text-xs text-ink-500 italic animate-fade-up">{message}</p>
      )}
    </section>
  )
}
