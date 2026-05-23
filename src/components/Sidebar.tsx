import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import {
  useCountsQuery,
  useProactiveQuery,
} from '../state'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChatIcon,
  EntitiesIcon,
  GraphIcon,
  HomeIcon,
  MusicIcon,
  QuoteIcon,
  RelationsIcon,
  SearchIcon,
  SettingsIcon,
  SparkleIcon,
  TramaMark,
} from './Icons'
import { AIModeToggle } from './AIModeToggle'

export type ViewMode = 'inicio' | 'grafo' | 'entidades' | 'citas' | 'relaciones' | 'escuchas' | 'chat' | 'sugerencias'

type NavItem = {
  value: ViewMode
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { value: 'inicio', label: 'Inicio', icon: HomeIcon },
  { value: 'grafo', label: 'Grafo', icon: GraphIcon },
  { value: 'entidades', label: 'Entidades', icon: EntitiesIcon },
  { value: 'citas', label: 'Citas', icon: QuoteIcon },
  { value: 'relaciones', label: 'Relaciones', icon: RelationsIcon },
  { value: 'escuchas', label: 'Escuchas', icon: MusicIcon },
  { value: 'chat', label: 'Chat', icon: ChatIcon },
  { value: 'sugerencias', label: 'Sugerencias', icon: SparkleIcon },
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
  const { data: pendingSuggestions = [] } = useProactiveQuery()
  // Counts vienen del endpoint agregado — el Sidebar ya no carga la lista
  // completa de entidades. A 100k+ es la única opción viable.
  const { data: totals } = useCountsQuery()
  const isMobile = useIsMobile()

  const [searchQuery, setSearchQuery] = useState('')

  const counts: Record<ViewMode, number | null> = {
    inicio: null,
    grafo: null,
    // Sin fallback wholesale: si los totales todavía no cargaron, mostramos
    // null (la UI no pinta el badge). Es mejor que mentir con "0".
    entidades: totals?.entities ?? null,
    citas: totals?.quotes ?? null,
    relaciones: totals?.relationships ?? null,
    escuchas: null,
    chat: null,
    sugerencias: pendingSuggestions.length > 0 ? pendingSuggestions.length : null,
  }

  // Debounce 250ms antes de cada fetch para no embebir en cada tecla.
  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setDebouncedQuery('')
      return
    }
    const id = setTimeout(() => setDebouncedQuery(trimmed), 250)
    return () => clearTimeout(id)
  }, [searchQuery])

  // Hybrid (lexical + semantic) search via /api/search. Sin fallback local:
  // a 100k+ no podemos asumir que tenemos la lista cargada en memoria.
  // Mientras espera, mostramos "buscando…". Si falla, mostramos el mensaje
  // de error (Trama queda visible pero sin resultados de búsqueda).
  const searchResp = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => api.search(debouncedQuery, { limit: 8 }),
    enabled: !!debouncedQuery,
    staleTime: 60_000,
  })

  const searchResults =
    searchResp.data?.entities.map((hit) => ({
      id: hit.id,
      name: hit.name,
      type: hit.type,
      score: hit.score,
    })) ?? []
  const searchPending =
    !!debouncedQuery && (searchResp.isLoading || searchResp.isFetching)

  // ---------- collapsed sidebar ----------
  if (collapsed) {
    return (
      <aside className="surface-sidebar w-14 shrink-0 border-r border-ink-100 flex flex-col items-center py-4 gap-1">
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
                <Icon size={18} />
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-1 h-5 rounded-r bg-ink-700" />
                )}
                {counts[item.value] !== null && counts[item.value]! > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-ink-700 text-paper-50 text-micro font-medium tabular-nums flex items-center justify-center">
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
          <AIModeToggle collapsed />
          <button
            onClick={onOpenSettings}
            aria-label="Configuración"
            title="Configuración"
            className="p-2 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded-md transition-colors active:scale-95"
          >
            <SettingsIcon size={14} />
          </button>
        </div>
      </aside>
    )
  }

  // ---------- expanded sidebar ----------
  return (
    <>
      {/* Mobile: backdrop closes the sidebar when tapped. */}
      {isMobile && (
        <button
          onClick={onToggleCollapsed}
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm cursor-default md:hidden"
          tabIndex={-1}
        />
      )}
    <aside
      className={
        isMobile
          ? 'surface-sidebar fixed inset-y-0 left-0 w-64 z-40 border-r border-ink-100 flex flex-col shadow-2xl'
          : 'surface-sidebar w-64 shrink-0 border-r border-ink-100 flex flex-col'
      }
    >
      <header className="px-3 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 trama-mark-interactive min-w-0" title="Trama">
          <TramaMark size={22} className="text-ink-700 shrink-0" />
          <h1 className="wordmark text-lg text-ink-800 leading-none truncate">Trama</h1>
          {offline && (
            <span
              title="Sin conexión al backend"
              className="text-micro uppercase tracking-wider text-amber-700 leading-none shrink-0"
            >
              local
            </span>
          )}
        </div>
        <button
          onClick={onToggleCollapsed}
          aria-label="Contraer sidebar"
          className="p-1 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors shrink-0"
        >
          <ChevronLeftIcon size={14} />
        </button>
      </header>

      {/* Mostramos la barra siempre que no sepamos con certeza que la
          trama está vacía. Si totals aún no respondió, asumimos no-vacío
          para que el input aparezca de inmediato. */}
      {(totals === undefined || totals.entities > 0) && (
        <div className="px-3 pb-2">
          <div className="relative">
            <SearchIcon
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar entidades"
              className="w-full text-body pl-7 pr-2 py-1.5 rounded-md border border-ink-100 bg-paper-50 text-ink-700 placeholder:text-ink-400 focus:outline-none focus:border-ink-200 focus:ring-1 focus:ring-ink-200 transition-colors"
            />
          </div>
          {debouncedQuery && (
            <div className="mt-1.5 max-h-64 overflow-y-auto">
              {searchPending ? (
                <p className="px-2 py-1 text-xs text-ink-400 italic">buscando…</p>
              ) : searchResp.error ? (
                <p className="px-2 py-1 text-xs text-red-700">
                  No se pudo buscar.
                </p>
              ) : searchResults.length === 0 ? (
                <p className="px-2 py-1 text-xs text-ink-400 italic">
                  sin resultados
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {searchResults.map((entity) => (
                    <li key={entity.id}>
                      <button
                        onClick={() => {
                          onSelectEntity?.(entity.id)
                          setSearchQuery('')
                        }}
                        className="w-full text-left px-2 py-1 text-body rounded hover:bg-ink-100 transition-colors flex items-baseline justify-between gap-2"
                      >
                        <span className="text-ink-700 truncate">{entity.name}</span>
                        <span className="text-micro uppercase tracking-wider text-ink-400 shrink-0">
                          {entity.type}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <nav className="flex flex-col px-2 gap-px">
        {NAV_ITEMS.map((item) => {
          const active = view === item.value
          const Icon = item.icon
          return (
            <button
              key={item.value}
              onClick={() => onChangeView(item.value)}
              aria-label={item.label}
              className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-body transition-colors relative ${
                active
                  ? 'text-ink-800 bg-ink-100 font-medium'
                  : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100/60'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  size={14}
                  className={active ? 'text-ink-700' : 'text-ink-400 group-hover:text-ink-600'}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {counts[item.value] !== null && (
                <span
                  className={
                    item.value === 'sugerencias'
                      ? 'tabular-nums text-caption px-1.5 py-px rounded font-medium'
                      : 'tabular-nums text-caption text-ink-400 font-normal'
                  }
                  style={
                    item.value === 'sugerencias'
                      ? {
                          backgroundColor: 'var(--accent-primary-soft)',
                          color: 'var(--accent-primary)',
                        }
                      : undefined
                  }
                >
                  {counts[item.value]}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="flex-1" />

      <div className="px-2 pt-2 pb-2 mt-2 border-t border-ink-100 space-y-px">
        <AIModeToggle />
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-body text-ink-500 hover:text-ink-800 hover:bg-ink-100/60 transition-colors"
        >
          <SettingsIcon size={14} className="text-ink-400" />
          <span>Configuración</span>
        </button>
        <p className="text-micro uppercase tracking-wider text-ink-300 text-center pt-2 pb-0.5">
          trama · v0.8.0
        </p>
      </div>
    </aside>
    </>
  )
}
