import { useMemo, useRef, useState } from 'react'
import { useTrama } from '../state'
import type { ExportPayload } from '../types'

export type ViewMode = 'grafo' | 'entidades' | 'citas' | 'relaciones'

const NAV_ITEMS: { value: ViewMode; label: string }[] = [
  { value: 'grafo', label: 'Grafo' },
  { value: 'entidades', label: 'Entidades' },
  { value: 'citas', label: 'Citas' },
  { value: 'relaciones', label: 'Relaciones' },
]

export function Sidebar({
  view,
  onChangeView,
  collapsed,
  onToggleCollapsed,
  onSelectEntity,
}: {
  view: ViewMode
  onChangeView: (v: ViewMode) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelectEntity?: (id: string) => void
}) {
  const { entities, relationships, quotes, offline, exportAll, importAll } = useTrama()
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

  // Client-side fuzzy match: case-insensitive substring on name + description.
  // Good enough for graphs up to a few thousand entities. Beyond that, switch to
  // backend /api/search which uses Postgres FTS + trigrams.
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
      const payload = await exportAll()
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
      const imported = await importAll(payload)
      setMessage(`Importado: ${imported} elementos`)
    } catch (err) {
      setMessage(err instanceof Error ? `Error: ${err.message}` : 'Error al importar')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      window.setTimeout(() => setMessage(null), 4000)
    }
  }

  return (
    <aside
      className={`${collapsed ? 'w-12' : 'w-64'} shrink-0 transition-[width] duration-200 border-r border-ink-100/60 bg-paper-50/60 backdrop-blur-sm flex flex-col`}
    >
      <header className="px-3 py-4 flex items-center justify-between gap-2">
        {!collapsed && (
          <div className="flex items-baseline gap-2">
            <h1 className="font-serif text-2xl text-ink-700 leading-none">Trama</h1>
            {offline && (
              <span
                title="Sin conexión al backend — usando almacenamiento local del navegador"
                className="text-[9px] uppercase tracking-[0.18em] text-amber-700/80 leading-none"
              >
                local
              </span>
            )}
          </div>
        )}
        <button
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expandir sidebar' : 'Contraer sidebar'}
          className="p-1.5 text-ink-300 hover:text-ink-600 hover:bg-ink-50 rounded transition-colors"
        >
          {collapsed ? '›' : '‹'}
        </button>
      </header>

      {!collapsed && entities.length > 0 && (
        <div className="px-3 pb-3">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar entidades"
            className="input-paper w-full text-sm"
          />
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

      <nav className="flex flex-col px-2 mt-2 gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = view === item.value
          return (
            <button
              key={item.value}
              onClick={() => onChangeView(item.value)}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
              className={`flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${
                active
                  ? 'bg-ink-700/8 text-ink-700'
                  : 'text-ink-400 hover:text-ink-700 hover:bg-ink-700/4'
              }`}
            >
              {collapsed ? (
                <span className="font-serif text-base mx-auto">{item.label[0]}</span>
              ) : (
                <>
                  <span>{item.label}</span>
                  {counts[item.value] !== null && (
                    <span className="text-xs text-ink-300 tabular-nums">
                      {counts[item.value]}
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </nav>

      <div className="flex-1" />

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          {message && (
            <p className="text-[10px] uppercase tracking-[0.16em] text-ink-400">{message}</p>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={handleExport}
              disabled={busy}
              className="flex-1 text-[10px] uppercase tracking-[0.16em] text-ink-400 hover:text-ink-700 transition-colors py-1.5 disabled:text-ink-200"
              title="Exportar toda tu trama como JSON"
            >
              exportar
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex-1 text-[10px] uppercase tracking-[0.16em] text-ink-400 hover:text-ink-700 transition-colors py-1.5 disabled:text-ink-200"
              title="Importar un JSON exportado previamente"
            >
              importar
            </button>
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-200 text-center pt-1">
            trama · v0.5.0
          </p>
        </div>
      )}

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
