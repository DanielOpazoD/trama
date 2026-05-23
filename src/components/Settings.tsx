import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useExport, useImport } from '../state'
import type { ExportPayload } from '../types'
import { AITaskSettings } from './AITaskSettings'
import {
  CloseIcon,
  DownloadIcon,
  MoonIcon,
  SunIcon,
  UploadIcon,
} from './Icons'

function formatRelative(iso: string | null): string {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'hace instantes'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function Settings({
  open,
  onClose,
  theme,
  onToggleTheme,
}: {
  open: boolean
  onClose: () => void
  theme: 'paper' | 'night'
  onToggleTheme: () => void
}) {
  const doExport = useExport()
  const doImport = useImport()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const spotifyStatus = useQuery({
    queryKey: ['spotify', 'status'],
    queryFn: () => api.spotifyStatus(),
    enabled: open,
    retry: false,
  })

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(null), 4000)
    return () => window.clearTimeout(t)
  }, [message])

  async function handleExport() {
    setBusy(true); setMessage(null)
    try {
      const payload = await doExport()
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `trama-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessage('Exportado correctamente')
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al exportar')
    } finally {
      setBusy(false)
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true); setMessage(null)
    try {
      const text = await file.text()
      const payload = JSON.parse(text) as ExportPayload
      if (payload.version !== 1) throw new Error(`versión ${payload.version} no soportada`)
      const imported = await doImport(payload)
      setMessage(`Importado: ${imported} elementos`)
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al importar')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSyncSpotify() {
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

  async function handleDisconnectSpotify() {
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

  if (!open) return null

  const spotify = spotifyStatus.data

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar configuración"
        className="fixed inset-0 z-30 bg-ink-900/20 backdrop-blur-sm cursor-default animate-view-fade"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-label="Configuración"
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-full max-w-md max-h-[85vh]
                   bg-paper-50/95 border border-ink-100/60 rounded-2xl shadow-2xl shadow-ink-900/20
                   backdrop-blur-md animate-slide-in-right overflow-hidden flex flex-col"
      >
        <header className="px-6 py-4 border-b border-ink-100/60 flex items-baseline justify-between shrink-0">
          <div>
            <p className="text-micro uppercase tracking-eyebrow text-ink-300 mb-1">ajustes</p>
            <h2 className="font-serif text-2xl text-ink-700 leading-none">Configuración</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors active:scale-90"
          >
            <CloseIcon size={14} />
          </button>
        </header>

        <div className="p-6 space-y-7 overflow-y-auto">
          {/* Health: estado del sistema, gasto IA, errores. Arriba porque
              cuando algo va mal, esto es lo primero que querés abrir. */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-ink-700">Estado del sistema</h3>
              <p className="text-xs text-ink-400 mt-0.5">
                Gasto IA del mes, errores recientes, conteos. Si algo va
                raro, mirá acá antes que en cualquier otro lado.
              </p>
            </div>
            <HealthSection />
          </section>

          {/* Theme */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-ink-700">Apariencia</h3>
              <p className="text-xs text-ink-400 mt-0.5">
                Modo papel para el día, modo noche para horas tardías. La elección
                se recuerda en este navegador.
              </p>
            </div>
            <div className="flex gap-2 p-1 bg-paper-100/60 rounded-lg border border-ink-100/50 w-fit">
              <button
                onClick={() => theme !== 'paper' && onToggleTheme()}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-150 active:scale-95 ${
                  theme === 'paper'
                    ? 'bg-paper-50 text-ink-700 shadow-sm'
                    : 'text-ink-400 hover:text-ink-700'
                }`}
              >
                <SunIcon size={14} />
                Papel
              </button>
              <button
                onClick={() => theme !== 'night' && onToggleTheme()}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-150 active:scale-95 ${
                  theme === 'night'
                    ? 'bg-paper-50 text-ink-700 shadow-sm'
                    : 'text-ink-400 hover:text-ink-700'
                }`}
              >
                <MoonIcon size={14} />
                Noche
              </button>
            </div>
          </section>

          {/* Spotify */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-ink-700">Spotify</h3>
              <p className="text-xs text-ink-400 mt-0.5">
                Trama puede registrar lo que escuchás en Spotify para que luego
                decidas qué entra al mapa. Lo registrado vive aparte —
                <em> nada entra a la trama sin que tú lo apruebes</em>.
              </p>
            </div>
            {spotifyStatus.isLoading ? (
              <p className="text-xs text-ink-300 italic">cargando…</p>
            ) : spotify && spotify.connected ? (
              <div className="space-y-2 p-3 bg-paper-100/40 rounded-lg border border-ink-100/50">
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
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSyncSpotify}
                    disabled={busy}
                    className="text-xs px-3 py-1.5 border border-ink-100/60 rounded-md hover:bg-ink-50 active:scale-[0.97] transition-all disabled:opacity-50"
                  >
                    Sincronizar ahora
                  </button>
                  <button
                    onClick={handleDisconnectSpotify}
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
                className="inline-block text-sm px-3 py-2 border border-ink-100/60 rounded-lg hover:bg-ink-50 active:scale-[0.97] transition-all"
              >
                Conectar con Spotify
              </a>
            )}
          </section>

          {/* IA por tarea */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-ink-700">IA por tarea</h3>
              <p className="text-xs text-ink-400 mt-0.5">
                Cada tarea puede usar un modelo distinto. La capa interna
                pasa por el provider elegido aquí; si no eliges nada, usa el
                default general de Netlify.
              </p>
            </div>
            <AITaskSettings />
          </section>

          {/* Búsqueda semántica */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-ink-700">Búsqueda semántica</h3>
              <p className="text-xs text-ink-400 mt-0.5">
                La búsqueda en la sidebar combina coincidencia textual con
                similitud por significado vía embeddings. Las entidades y
                citas que añades de aquí en adelante se indexan al guardarse.
                Para indexar lo que ya tenías, dispara una reindexación.
              </p>
            </div>
            <ReindexEmbeddingsSection />
          </section>

          {/* Data */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-ink-700">Datos</h3>
              <p className="text-xs text-ink-400 mt-0.5">
                Exporta toda tu trama como un archivo JSON, o restaura una copia
                previa. Tu seguro de portabilidad.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                disabled={busy}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-ink-100/60 rounded-lg hover:bg-ink-50 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <DownloadIcon size={14} />
                Exportar
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-ink-100/60 rounded-lg hover:bg-ink-50 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <UploadIcon size={14} />
                Importar
              </button>
            </div>
            {message && (
              <p className="text-xs text-ink-500 italic animate-fade-up">{message}</p>
            )}
          </section>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </>
  )
}

/**
 * Triggers a batched reindex of entities and quotes that don't have an
 * embedding yet. Polls the same endpoint with POST until remaining=0.
 * Kept local because nothing else needs it.
 */
function ReindexEmbeddingsSection() {
  const [pending, setPending] = useState<{ entities: number; quotes: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchInfo, setBatchInfo] = useState<string | null>(null)

  // Initial check so the button text reflects what's pending.
  useEffect(() => {
    let mounted = true
    fetch('/api/reindex-embeddings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (mounted && data) setPending(data)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  async function run() {
    setRunning(true)
    setError(null)
    setBatchInfo(null)
    try {
      let total = 0
      // Up to 200 iterations × 25 rows each = 5000 rows. Plenty for a
      // personal trama at this stage. Each iteration is one HTTP call.
      for (let i = 0; i < 200; i++) {
        const res = await fetch('/api/reindex-embeddings', { method: 'POST' })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(text || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as {
          processed: number
          remaining: { entities: number; quotes: number }
        }
        total += data.processed
        setPending(data.remaining)
        setBatchInfo(
          `${total} indexados · faltan ${data.remaining.entities + data.remaining.quotes}`,
        )
        if (data.processed === 0) break
        if (data.remaining.entities + data.remaining.quotes === 0) break
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const totalPending = pending ? pending.entities + pending.quotes : null

  return (
    <div className="space-y-2">
      {totalPending !== null && (
        <p className="text-xs text-ink-400">
          {totalPending === 0
            ? 'Todo indexado. Tu trama es buscable por significado.'
            : `Sin indexar: ${pending?.entities ?? 0} entidades, ${
                pending?.quotes ?? 0
              } citas.`}
        </p>
      )}
      <div className="flex items-baseline gap-3">
        <button
          onClick={run}
          disabled={running || totalPending === 0}
          className="text-sm px-3 py-2 border border-ink-100/60 rounded-lg hover:bg-ink-50 active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? 'indexando…' : 'Indexar lo pendiente'}
        </button>
        {batchInfo && (
          <span className="text-xs text-ink-400 tabular-nums">{batchInfo}</span>
        )}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/**
 * Panel de estado del sistema. Trae todo de /api/health en un solo
 * fetch y lo muestra como bloque. Refresca al abrir Settings (staleTime
 * corto) para que los números sean actuales.
 */
function HealthSection() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    staleTime: 15_000,
  })

  if (isLoading) {
    return <p className="text-xs text-ink-300 italic">cargando…</p>
  }
  if (error || !data) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-red-700">
          No se pudo cargar el estado del sistema.
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

  const budgetPctDisplay = Math.round(data.budget.pct * 100)
  const budgetEur = (data.budget.limitCents / 100).toFixed(2)
  const monthEur = (data.month.costCents / 100).toFixed(2)
  const remainingEur = (data.budget.remainingCents / 100).toFixed(2)

  // El color del badge cambia según consumo: verde <50%, ámbar 50-80%, rojo >80%.
  const budgetTone =
    data.budget.pct < 0.5
      ? { bg: 'var(--accent-sage-soft)', fg: 'var(--accent-sage)' }
      : data.budget.pct < 0.8
        ? { bg: 'var(--accent-gold-soft)', fg: 'var(--accent-gold)' }
        : { bg: 'rgb(239 68 68 / 0.10)', fg: 'rgb(185 28 28)' }

  return (
    <div className="space-y-4 p-4 bg-paper-100/40 border border-ink-100/50 rounded-lg">
      {/* Counts */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-500">
        <span><strong className="text-ink-700 tabular-nums">{data.counts.entities}</strong> entidades</span>
        <span><strong className="text-ink-700 tabular-nums">{data.counts.quotes}</strong> citas</span>
        <span><strong className="text-ink-700 tabular-nums">{data.counts.relationships}</strong> relaciones</span>
      </div>

      {/* Budget */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs uppercase tracking-eyebrow text-ink-400">
            gasto IA este mes
          </span>
          <span
            className="text-micro uppercase tracking-eyebrow font-medium px-2 py-0.5 rounded-full tabular-nums"
            style={{ backgroundColor: budgetTone.bg, color: budgetTone.fg }}
          >
            {budgetPctDisplay}% del cap
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-ink-100/60 overflow-hidden">
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${Math.min(100, budgetPctDisplay)}%`,
              backgroundColor: budgetTone.fg,
            }}
          />
        </div>
        <div className="flex items-baseline justify-between text-xs text-ink-400 tabular-nums">
          <span>
            <strong className="text-ink-700">USD {monthEur}</strong> usados ·{' '}
            <span className="text-ink-300">USD {budgetEur} cap</span>
          </span>
          <span className="text-ink-300">USD {remainingEur} restantes</span>
        </div>
        <p className="text-micro text-ink-300 tabular-nums">
          {data.month.calls} llamadas · {data.month.tokensIn.toLocaleString('es')} tokens in ·{' '}
          {data.month.tokensOut.toLocaleString('es')} tokens out
        </p>
      </div>

      {/* Provider breakdown */}
      {data.byProvider.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-eyebrow text-ink-400">
            por provider / modelo (mes)
          </p>
          <ul className="space-y-1">
            {data.byProvider.map((row) => (
              <li
                key={`${row.provider}-${row.model}`}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <span className="text-ink-600 truncate">
                  <span className="font-medium">{row.provider}</span>
                  <span className="text-ink-400"> · {row.model}</span>
                </span>
                <span className="text-ink-400 tabular-nums shrink-0">
                  {row.calls} · USD {(row.costCents / 100).toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent errors */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs uppercase tracking-eyebrow text-ink-400">
            errores recientes (7d)
          </p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors disabled:opacity-50"
          >
            {isFetching ? 'recargando…' : 'recargar'}
          </button>
        </div>
        {data.recentErrors.length === 0 ? (
          <p className="text-xs text-ink-300 italic">
            sin errores. nada que mirar.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data.recentErrors.map((e) => (
              <li
                key={e.id}
                className="text-xs space-y-0.5 px-2.5 py-1.5 bg-red-50/40 border border-red-200/40 rounded"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-700 font-medium">
                    {e.functionName}
                    {e.statusCode && (
                      <span className="ml-1.5 text-micro text-red-700/80">
                        [{e.statusCode}]
                      </span>
                    )}
                  </span>
                  <span className="text-micro text-ink-300 tabular-nums shrink-0">
                    {new Date(e.createdAt).toLocaleString('es', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-ink-500 break-words leading-snug">
                  {e.message.slice(0, 240)}
                  {e.message.length > 240 ? '…' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
