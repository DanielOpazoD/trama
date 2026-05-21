import { useMemo, useState } from 'react'
import {
  useEntitiesQuery,
  useQuotesQuery,
  useRelationshipsQuery,
} from '../state'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EntitiesIcon,
  GraphIcon,
  QuoteIcon,
  RelationsIcon,
  SearchIcon,
  SettingsIcon,
  TramaMark,
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
  onOpenSettings,
}: {
  view: ViewMode
  onChangeView: (v: ViewMode) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  onSelectEntity?: (id: string) => void
  offline: boolean
  onOpenSettings: () => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const { data: quotes = [] } = useQuotesQuery()

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

  // ---------- collapsed sidebar ----------
  if (collapsed) {
    return (
      <aside className="w-14 shrink-0 border-r border-ink-100/40 flex flex-col items-center py-4 gap-1">
        <div className="text-ink-700 mb-2 trama-mark-interactive" aria-label="Trama" title="Trama">
          <TramaMark size={22} />
        </div>

        <button
          onClick={onToggleCollapsed}
          aria-label="Expandir sidebar"
          className="p-2 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded-md transition-colors"
        >
          <ChevronRightIcon size={14} />
        </button>

        <div className="w-7 h-px bg-ink-100/70 my-2" />

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
                className={`relative p-2.5 rounded-lg transition-all duration-250 ease-out active:scale-95 ${
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

        <div className="mt-auto flex flex-col gap-1 items-center">
          {offline && (
            <span
              title="modo local"
              className="w-1.5 h-1.5 rounded-full bg-amber-500/70"
              aria-label="Sin conexión al backend"
            />
          )}
          <button
            onClick={onOpenSettings}
            aria-label="Configuración"
            title="Configuración"
            className="p-2 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded-md transition-colors active:scale-95"
          >
            <SettingsIcon size={15} />
          </button>
        </div>
      </aside>
    )
  }

  // ---------- expanded sidebar ----------
  return (
    <aside className="w-64 shrink-0 border-r border-ink-100/40 flex flex-col">
      <header className="px-3 py-4 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 trama-mark-interactive" title="Trama">
          <TramaMark size={26} className="text-ink-700 shrink-0" />
          <div className="flex items-baseline gap-2 min-w-0">
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
        </div>
        <button
          onClick={onToggleCollapsed}
          aria-label="Contraer sidebar"
          className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors -mr-1 shrink-0"
        >
          <ChevronLeftIcon />
        </button>
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
              className={`group flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ease-out active:scale-[0.98] relative ${
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

      <div className="px-2 pb-3 pt-2 border-t border-ink-100/40 mx-3">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink-400 hover:text-ink-700 hover:bg-ink-700/4 transition-all duration-200 active:scale-[0.98]"
        >
          <SettingsIcon size={15} className="text-ink-300 group-hover:text-ink-600" />
          <span>Configuración</span>
        </button>
        <p className="text-[10px] uppercase tracking-[0.18em] text-ink-200 text-center pt-3">
          trama · v0.8.0
        </p>
      </div>
    </aside>
  )
}
