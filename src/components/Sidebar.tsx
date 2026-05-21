import { useMemo, useRef, useState } from 'react'
import {
  useEntitiesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
  useExport,
  useImport,
} from '../state'
import type { ExportPayload } from '../types'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  EntitiesIcon,
  GraphIcon,
  MoonIcon,
  QuoteIcon,
  RelationsIcon,
  SearchIcon,
  SunIcon,
  TramaMark,
  UploadIcon,
} from './Icons'

export type ViewMode = 'grafo' | 'entidades' | 'citas' | 'relaciones'

type NavItem = {
  value: ViewMode
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { value: 'grafo', label: 'Grafo', icon: GraphIcon },
  { value: 'entidades', label: 'Entidades', icon: EntitiesIcon },
  { value: 'citas', label: 'Citas', icon: QuoteIcon },
  { value: 'relaciones', label: 'Relaciones', icon: RelationsIcon },
]

export function Sidebar({
  view,
  onChangeView,
  collapsed,
  onToggleCollapsed,
  onSelectEntity,
  offline,
  theme,
  onToggleTheme,
}: {
  view: ViewMode
  onChangeView: (v: ViewMode) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelectEntity?: (id: string) => void
  offline: boolean
  theme: 'paper' | 'night'
  onToggleTheme: () => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const { data: quotes = [] } = useQuotesQuery()
  const doExport = useExport()
  const doImport = useImport()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const counts: Record<ViewMode, number | null> = {
    grafo: null,
    entidades: entities.length,
    citas: quotes.length,
    relaciones: relationships.length,
  }

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return entities
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.description?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8)
  }, [searchQuery, entities])

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
      setMessage('Exportado')
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al exportar')
    } finally {
      setBusy(false)
      window.setTimeout(() => setMessage(null), 3000)
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
      window.setTimeout(() => setMessage(null), 4000)
    }
  }

  // ---------- collapsed sidebar ----------
  if (collapsed) {
    return (
      <aside className="w-14 shrink-0 border-r border-ink-100/60 bg-paper-50/60 backdrop-blur-sm flex flex-col items-center py-4 gap-1">
        {/* Monogram top */}
        <div className="text-ink-700 mb-2" aria-label="Trama">
          <TramaMark size={22} />
        </div>

        {/* Expand button */}
        <button
          onClick={onToggleCollapsed}
          aria-label="Expandir sidebar"
          className="p-2 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded-md transition-colors"
        >
          <ChevronRightIcon size={14} />
        </button>

        {/* Divider */}
        <div className="w-7 h-px bg-ink-100/70 my-2" />

        {/* Nav icons */}
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = view === item.value
            const Icon = item.icon
            return (
              <button
                key={item.value}
                onClick={() => onChangeView(item.value)}
                aria-label={item.label}
                title={item.label}
                className={`relative p-2.5 rounded-md transition-colors ${
                  active
                    ? 'bg-ink-700/10 text-ink-700'
                    : 'text-ink-300 hover:text-ink-700 hover:bg-ink-700/5'
                }`}
              >
                <Icon size={17} />
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-1 h-5 rounded-r bg-ink-700" />
                )}
                {counts[item.value] !== null && counts[item.value]! > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-ink-700 text-paper-50 text-[9px] font-medium tabular-nums flex items-center justify-center">
                    {counts[item.value]}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Bottom: theme toggle */}
        <div className="mt-auto flex flex-col gap-1 items-center">
          {offline && (
            <span
              title="modo local"
              className="w-1.5 h-1.5 rounded-full bg-amber-500/70"
              aria-label="Sin conexión al backend"
            />
          )}
          <button
            onClick={onToggleTheme}
            aria-label={theme === 'paper' ? 'Cambiar a modo noche' : 'Cambiar a modo papel'}
            title={theme === 'paper' ? 'modo noche' : 'modo papel'}
            className="p-2 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded-md transition-colors"
          >
            {theme === 'paper' ? <MoonIcon size={14} /> : <SunIcon size={14} />}
          </button>
        </div>
      </aside>
    )
  }

  // ---------- expanded sidebar ----------
  return (
    <aside className="w-64 shrink-0 border-r border-ink-100/60 bg-paper-50/60 backdrop-blur-sm flex flex-col">
      <header className="px-3 py-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <TramaMark size={26} className="text-ink-700 shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="wordmark text-2xl text-ink-700 leading-none">Trama</h1>
              {offline && (
                <span
                  title="Sin conexión al backend"
                  className="text-[9px] uppercase tracking-[0.18em] text-amber-700/80 leading-none"
                >
                  local
                </span>
              )}
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-ink-200">
              mapa de afinidades
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 -mr-1 shrink-0">
          <button
            onClick={onToggleTheme}
            aria-label={theme === 'paper' ? 'Cambiar a modo noche' : 'Cambiar a modo papel'}
            title={theme === 'paper' ? 'modo noche' : 'modo papel'}
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors"
          >
            {theme === 'paper' ? <MoonIcon /> : <SunIcon />}
          </button>
          <button
            onClick={onToggleCollapsed}
            aria-label="Contraer sidebar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors"
          >
            <ChevronLeftIcon />
          </button>
        </div>
      </header>

      {entities.length > 0 && (
        <div className="px-3 pb-3">
          <div className="relative">
            <SearchIcon
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar…"
              aria-label="Buscar entidades"
              className="input-paper w-full text-sm pl-8"
            />
          </div>
          {searchResults.length > 0 && (
            <ul className="mt-2 space-y-0.5 max-h-64 overflow-y-auto">
              {searchResults.map((entity) => (
                <li key={entity.id}>
                  <button
                    onClick={() => {
                      onSelectEntity?.(entity.id)
                      setSearchQuery('')
                    }}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-ink-700/5 transition-colors"
                  >
                    <span className="text-ink-700">{entity.name}</span>
                    <span className="ml-2 text-[9px] uppercase tracking-[0.16em] text-ink-300">
                      {entity.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <nav className="flex flex-col px-2 mt-1 gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = view === item.value
          const Icon = item.icon
          return (
            <button
              key={item.value}
              onClick={() => onChangeView(item.value)}
              aria-label={item.label}
              className={`group flex items-center justify-between gap-3 px-3 py-2 rounded-md text-sm transition-colors relative ${
                active
                  ? 'bg-ink-700/8 text-ink-700'
                  : 'text-ink-400 hover:text-ink-700 hover:bg-ink-700/4'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-ink-700" />
              )}
              <span className="flex items-center gap-2.5">
                <Icon
                  size={15}
                  className={active ? 'text-ink-700' : 'text-ink-300 group-hover:text-ink-600'}
                />
                <span>{item.label}</span>
              </span>
              {counts[item.value] !== null && (
                <span className="text-xs text-ink-300 tabular-nums">
                  {counts[item.value]}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="flex-1" />

      <div className="px-3 pb-3 space-y-2">
        {message && (
          <p className="text-[10px] uppercase tracking-[0.16em] text-ink-400">{message}</p>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={handleExport}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-400 hover:text-ink-700 transition-colors py-1.5 disabled:text-ink-200"
            title="Exportar toda tu trama como JSON"
          >
            <DownloadIcon size={11} />
            exportar
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-ink-400 hover:text-ink-700 transition-colors py-1.5 disabled:text-ink-200"
            title="Importar un JSON exportado previamente"
          >
            <UploadIcon size={11} />
            importar
          </button>
        </div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-ink-200 text-center pt-1">
          trama · v0.7.1
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        className="hidden"
      />
    </aside>
  )
}
