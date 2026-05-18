import { useTrama } from '../state'

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
}: {
  view: ViewMode
  onChangeView: (v: ViewMode) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const { entities, relationships, quotes, offline } = useTrama()
  const counts: Record<ViewMode, number | null> = {
    grafo: null,
    entidades: entities.length,
    citas: quotes.length,
    relaciones: relationships.length,
  }

  return (
    <aside
      className={`${
        collapsed ? 'w-12' : 'w-64'
      } shrink-0 transition-[width] duration-200 border-r border-ink-100/60 bg-paper-50/60 backdrop-blur-sm flex flex-col`}
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
                <span className="font-serif text-base mx-auto">
                  {item.label[0]}
                </span>
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
        <footer className="p-3 text-[10px] uppercase tracking-[0.18em] text-ink-200">
          trama · v0.3.0
        </footer>
      )}
    </aside>
  )
}
