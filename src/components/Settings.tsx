import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useExport, useImport } from '../state'
import type { ExportPayload } from '../types'
import { AITaskSettings } from './AITaskSettings'
import { ProgressBar } from './ProgressBar'
import { Sparkline } from './Sparkline'
import {
  CloseIcon,
  DownloadIcon,
  MoonIcon,
  SunIcon,
  UploadIcon,
} from './Icons'

/**
 * Settings — modal full-screen con layout de dos columnas:
 *   - sidebar izquierdo (rail de navegación) con las secciones
 *   - panel derecho con el contenido de la sección activa
 *
 * Antes era un panel chico centrado de max-w-md que se sentía
 * apretado en pantallas grandes (parecía solo cubrir el tercio
 * inferior). Ahora ocupa la mayor parte del viewport — mismo
 * patrón que Linear, macOS System Settings, VS Code.
 *
 * Responsive: en mobile las tabs colapsan a chips horizontales arriba.
 */

type SectionId = 'health' | 'appearance' | 'spotify' | 'ai' | 'search' | 'data'

const SECTIONS: Array<{ id: SectionId; label: string; hint: string }> = [
  { id: 'health',     label: 'Estado',        hint: 'gasto, conteos, errores' },
  { id: 'appearance', label: 'Apariencia',    hint: 'papel / noche' },
  { id: 'spotify',    label: 'Spotify',       hint: 'sincronización' },
  { id: 'ai',         label: 'IA por tarea',  hint: 'modelo por flujo' },
  { id: 'search',     label: 'Búsqueda',      hint: 'embeddings + reindexado' },
  { id: 'data',       label: 'Datos',         hint: 'export / import' },
]

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
  const [section, setSection] = useState<SectionId>('health')

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar configuración"
        className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm cursor-default animate-view-fade"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-label="Configuración"
        className="fixed inset-4 md:inset-8 lg:inset-12 z-40 max-w-6xl max-h-[calc(100vh-4rem)] mx-auto
                   bg-paper-50 border border-ink-100 rounded-xl shadow-lg shadow-ink-900/15
                   animate-fade-up flex flex-col overflow-hidden"
      >
        <header className="px-6 py-4 border-b border-ink-100/60 flex items-baseline justify-between shrink-0">
          <div>
            <p className="text-micro uppercase tracking-eyebrow text-ink-300 mb-1">ajustes</p>
            <h2 className="font-serif text-2xl text-ink-700 leading-none">Configuración</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </header>

        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Rail de navegación — vertical en desktop, horizontal scrollable en mobile */}
          <nav
            className="md:w-52 shrink-0 md:border-r border-b md:border-b-0 border-ink-100/60
                       p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto"
            aria-label="Secciones de configuración"
          >
            {SECTIONS.map((s) => {
              const active = section === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`group shrink-0 md:shrink text-left px-3 py-2 rounded-md transition-colors ${
                    active
                      ? 'bg-ink-100 text-ink-800'
                      : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100/60'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <div className={`text-sm ${active ? 'font-medium' : ''}`}>
                    {s.label}
                  </div>
                  <div className="hidden md:block text-micro text-ink-300 mt-0.5 leading-tight">
                    {s.hint}
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Panel de contenido — scrollable */}
          <main className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
            <div className="max-w-2xl mx-auto animate-fade-up">
              {section === 'health' && <HealthSectionPanel />}
              {section === 'appearance' && (
                <AppearancePanel theme={theme} onToggleTheme={onToggleTheme} />
              )}
              {section === 'spotify' && <SpotifyPanel />}
              {section === 'ai' && <AIPanel />}
              {section === 'search' && <SearchPanel />}
              {section === 'data' && <DataPanel />}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}

/* ─────────────────────────────────────────────────────────────────────
   Section panels — cada uno renderiza UNA sección. Composición simple
   para que el switch en el render sea legible.
   ───────────────────────────────────────────────────────────────────── */

function PanelHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <header className="mb-6">
      <h3 className="font-serif text-xl text-ink-800 leading-tight">{title}</h3>
      <p className="mt-1 text-sm text-ink-400 leading-relaxed">{hint}</p>
    </header>
  )
}

function AppearancePanel({
  theme,
  onToggleTheme,
}: {
  theme: 'paper' | 'night'
  onToggleTheme: () => void
}) {
  return (
    <section>
      <PanelHeader
        title="Apariencia"
        hint="Modo papel para el día, modo noche para horas tardías. La elección se recuerda en este navegador."
      />
      <div className="flex gap-2 p-1 bg-paper-100/60 rounded-lg border border-ink-100/50 w-fit">
        <button
          onClick={() => theme !== 'paper' && onToggleTheme()}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-150 ${
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
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-150 ${
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
  )
}

function SpotifyPanel() {
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

function AIPanel() {
  return (
    <section>
      <PanelHeader
        title="IA por tarea"
        hint="Cada flujo de IA puede usar un modelo distinto. Si no eliges nada, usa el default de Netlify."
      />
      <AITaskSettings />
    </section>
  )
}

function SearchPanel() {
  return (
    <section>
      <PanelHeader
        title="Búsqueda semántica"
        hint="La búsqueda en la sidebar combina coincidencia textual con similitud por significado vía embeddings. Las entidades y citas nuevas se indexan al guardarse. Para indexar lo que ya tenías, dispara una reindexación."
      />
      <ReindexEmbeddingsSection />
    </section>
  )
}

function DataPanel() {
  const doExport = useExport()
  const doImport = useImport()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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

  return (
    <section>
      <PanelHeader
        title="Datos"
        hint="Exporta toda tu trama como un archivo JSON, o restaura una copia previa. Tu seguro de portabilidad."
      />
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={busy}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-ink-100/60 rounded-lg hover:bg-ink-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <DownloadIcon size={14} />
          Exportar
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-ink-100/60 rounded-lg hover:bg-ink-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <UploadIcon size={14} />
          Importar
        </button>
      </div>
      {message && (
        <p className="mt-3 text-xs text-ink-500 italic animate-fade-up">{message}</p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        className="hidden"
      />
    </section>
  )
}

/**
 * Triggers a batched reindex of entities and quotes that don't have an
 * embedding yet. Polls the same endpoint with POST until remaining=0.
 */
function ReindexEmbeddingsSection() {
  const [pending, setPending] = useState<{ entities: number; quotes: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Total al inicio del run — para calcular progreso real (processed/total)
  // en lugar de un spinner indeterminate.
  const [runStartTotal, setRunStartTotal] = useState(0)
  const [runProcessed, setRunProcessed] = useState(0)

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
    const startTotal = (pending?.entities ?? 0) + (pending?.quotes ?? 0)
    setRunStartTotal(startTotal)
    setRunProcessed(0)
    try {
      let total = 0
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
        setRunProcessed(total)
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
    <div className="space-y-3">
      {totalPending !== null && !running && (
        <p className="text-xs text-ink-400">
          {totalPending === 0
            ? 'Todo indexado. Tu trama es buscable por significado.'
            : `Sin indexar: ${pending?.entities ?? 0} entidades, ${
                pending?.quotes ?? 0
              } citas.`}
        </p>
      )}
      {running && (
        <ProgressBar
          label="Indexando embeddings"
          current={runProcessed}
          total={runStartTotal}
          hint="25 items por batch — no recargues la página"
        />
      )}
      <div className="flex items-baseline gap-3">
        <button
          onClick={run}
          disabled={running || totalPending === 0}
          className="text-sm px-3 py-2 border border-ink-100/60 rounded-lg hover:bg-ink-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? 'indexando…' : 'Indexar lo pendiente'}
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/**
 * Panel de estado del sistema. Trae todo de /api/health en un solo
 * fetch y lo muestra como bloque. Refresca al abrir Settings.
 */
function HealthSectionPanel() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    staleTime: 15_000,
  })

  if (isLoading) {
    return (
      <section>
        <PanelHeader
          title="Estado del sistema"
          hint="Gasto IA del mes, conteos, errores recientes."
        />
        <p className="text-xs text-ink-300 italic">cargando…</p>
      </section>
    )
  }
  if (error || !data) {
    return (
      <section>
        <PanelHeader
          title="Estado del sistema"
          hint="Gasto IA del mes, conteos, errores recientes."
        />
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
      </section>
    )
  }

  const budgetPctDisplay = Math.round(data.budget.pct * 100)
  const budgetEur = (data.budget.limitCents / 100).toFixed(2)
  const monthEur = (data.month.costCents / 100).toFixed(2)
  const remainingEur = (data.budget.remainingCents / 100).toFixed(2)

  const budgetTone =
    data.budget.pct < 0.5
      ? { bg: 'var(--accent-sage-soft)', fg: 'var(--accent-sage)' }
      : data.budget.pct < 0.8
        ? { bg: 'var(--accent-gold-soft)', fg: 'var(--accent-gold)' }
        : { bg: 'rgb(239 68 68 / 0.10)', fg: 'rgb(185 28 28)' }

  return (
    <section className="space-y-6">
      <PanelHeader
        title="Estado del sistema"
        hint="Gasto IA del mes, conteos, errores recientes. Si algo va raro, mirá acá antes que en cualquier otro lado."
      />

      {/* Alertas activas — banners arriba para que sean lo primero que
          se ve cuando hay algo que mirar. Si el array está vacío, no
          se renderiza nada. */}
      {data.alerts.length > 0 && (
        <ul className="space-y-2" aria-label="Alertas activas">
          {data.alerts.map((alert) => (
            <li
              key={alert.code}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${
                alert.severity === 'error'
                  ? 'alert-error'
                  : alert.severity === 'warn'
                    ? 'alert-warn'
                    : 'bg-sky-50/80 border-sky-200/60 text-sky-900'
              }`}
            >
              <span
                aria-hidden
                className={`mt-1.5 size-1.5 rounded-full shrink-0 ${
                  alert.severity === 'error'
                    ? 'bg-red-600'
                    : alert.severity === 'warn'
                      ? 'bg-amber-600'
                      : 'bg-sky-600'
                } ${alert.severity !== 'info' ? 'animate-pulse-subtle' : ''}`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium leading-tight">{alert.label}</div>
                <p className="mt-1 text-xs leading-relaxed opacity-80">{alert.hint}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Counts hero */}
      <div className="grid grid-cols-3 gap-3">
        <CountTile label="Entidades" value={data.counts.entities} />
        <CountTile label="Citas" value={data.counts.quotes} />
        <CountTile label="Relaciones" value={data.counts.relationships} />
      </div>

      {/* Budget */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-micro uppercase tracking-eyebrow text-ink-400">
            gasto IA este mes
          </span>
          <span
            className="text-micro uppercase tracking-eyebrow font-medium px-2 py-0.5 rounded-full tabular-nums"
            style={{ backgroundColor: budgetTone.bg, color: budgetTone.fg }}
          >
            {budgetPctDisplay}% del cap
          </span>
        </div>
        <div className="h-2 rounded-full bg-ink-100/60 overflow-hidden">
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

      {/* Sparkline 30d — la forma del gasto diario. Más informativo que
          el total mensual: ¿gastas parejo, picos puntuales, tendencia? */}
      {data.dailyCost && data.dailyCost.length > 0 && (
        <div className="card-paper p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-micro uppercase tracking-eyebrow text-ink-400">
              consumo diario · últimos 30 días
            </span>
            <span className="text-micro text-ink-300 tabular-nums">
              {data.dailyCost.filter((d) => d.calls > 0).length} días activos
            </span>
          </div>
          <Sparkline
            data={data.dailyCost.map((d) => d.costCents)}
            width={520}
            height={48}
            color="var(--accent-primary)"
            ariaLabel="Consumo de IA por día, últimos 30 días"
          />
          <div className="flex items-baseline justify-between text-micro text-ink-400 tabular-nums">
            <span>
              hace 30d
            </span>
            <span>hoy</span>
          </div>
        </div>
      )}

      {/* Provider breakdown */}
      {data.byProvider.length > 0 && (
        <div className="space-y-2">
          <p className="text-micro uppercase tracking-eyebrow text-ink-400">
            por provider / modelo (mes)
          </p>
          <ul className="space-y-1 card-paper p-3">
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
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-micro uppercase tracking-eyebrow text-ink-400">
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
          <p className="text-xs text-ink-300 italic">sin errores. nada que mirar.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.recentErrors.map((e) => (
              <li
                key={e.id}
                className="text-xs space-y-0.5 px-2.5 py-1.5 alert-error rounded"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    {e.functionName}
                    {e.statusCode && (
                      <span className="ml-1.5 text-micro opacity-80">[{e.statusCode}]</span>
                    )}
                  </span>
                  <span className="text-micro tabular-nums shrink-0 opacity-70">
                    {new Date(e.createdAt).toLocaleString('es', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="break-words leading-snug opacity-80">
                  {e.message.slice(0, 240)}
                  {e.message.length > 240 ? '…' : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-paper p-4 text-center">
      <div className="text-3xl font-serif text-ink-800 tabular-nums leading-none">
        {value.toLocaleString('es')}
      </div>
      <div className="mt-1.5 text-micro uppercase tracking-eyebrow text-ink-400">
        {label}
      </div>
    </div>
  )
}
