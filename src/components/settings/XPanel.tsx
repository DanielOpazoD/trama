import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../api'
import { describeOAuthReturn, type OAuthReturn } from '../../lib/oauthReturn'
import { PanelHeader, formatRelative } from './_shared'
import { queryKeys } from '../../state/queryClient'

/**
 * Conexión con X (Twitter): trae tus bookmarks y los guarda. Espejo del
 * panel de Spotify. Inerte hasta configurar X_CLIENT_ID/SECRET/REDIRECT_URI
 * (en modo prueba o sin claves, "Conectar" no hace nada).
 */
export function XPanel({ oauthReturn }: { oauthReturn?: OAuthReturn | null }) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Resultado del callback OAuth (persistente, no auto-desaparece: el código
  // de error sirve para reportar/diagnosticar).
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const xStatus = useQuery({
    queryKey: queryKeys.xStatus,
    queryFn: () => api.xStatus(),
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
    if (oauthReturn.ok) queryClient.invalidateQueries({ queryKey: queryKeys.x })
  }, [oauthReturn, queryClient])

  async function handleConnect() {
    setBusy(true)
    setMessage(null)
    try {
      const { url } = await api.xLogin()
      if (url) {
        window.location.href = url
        return
      }
      setMessage('X no está disponible en este modo.')
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al conectar')
    } finally {
      setBusy(false)
    }
  }

  async function handleSync() {
    setBusy(true)
    setMessage(null)
    try {
      const r = await api.xSync()
      setMessage(`Sincronizado: ${r.inserted} bookmarks nuevos`)
      queryClient.invalidateQueries({ queryKey: queryKeys.x })
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al sincronizar')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar X? Los bookmarks guardados se mantienen.')) return
    setBusy(true)
    setMessage(null)
    try {
      await api.xDisconnect()
      setMessage('X desconectado')
      queryClient.invalidateQueries({ queryKey: queryKeys.x })
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al desconectar')
    } finally {
      setBusy(false)
    }
  }

  const x = xStatus.data

  return (
    <section>
      <PanelHeader
        title="X (Twitter)"
        hint="Trama puede traer tus tweets marcados (bookmarks) para que luego decidas qué entra al mapa. Lo guardado vive aparte — nada entra a la trama sin que lo apruebes. Requiere una app de desarrollador de X."
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
      {xStatus.isLoading ? (
        <p className="text-xs text-ink-300 italic">cargando…</p>
      ) : x && x.connected ? (
        <div className="space-y-3 p-4 bg-paper-100/40 rounded-lg border border-ink-100/50">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm text-ink-700">
              Conectado como{' '}
              <strong className="font-medium">
                {x.username ? `@${x.username}` : 'tu cuenta'}
              </strong>
            </p>
            <span className="text-micro text-ink-400 tabular-nums">
              {formatRelative(x.lastSyncedAt)}
            </span>
          </div>
          <div className="flex gap-3 text-xs text-ink-400 tabular-nums">
            <span>{x.counts.totalBookmarks} bookmarks guardados</span>
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
          Conectar con X
        </button>
      )}
      {message && (
        <p className="mt-3 text-xs text-ink-500 italic animate-fade-up">{message}</p>
      )}
    </section>
  )
}
