import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, SettingsIcon } from '../Icons'
import { AIModeToggle } from '../AIModeToggle'
import { TopBar } from '../TopBar'
import { WorldSwitcher } from '../WorldSwitcher'
import type { World } from '../../types/world'
import type { NotasSection } from '../../types/notas'
import { NOTAS_SECTION_TITLES, type NotasSectionMeta } from './notasSections'

const ACCENT = 'var(--accent-sage)'

export function NotasTopBar({ section }: { section: NotasSection }) {
  return (
    <div>
      <TopBar view="inicio" titleOverride={NOTAS_SECTION_TITLES[section]} />
      <div
        aria-hidden
        className="h-[2px] w-full shrink-0 transition-[background] duration-300 ease-out"
        style={{
          backgroundImage: `linear-gradient(90deg, transparent 0%, ${ACCENT} 40%, ${ACCENT} 60%, transparent 100%)`,
        }}
      />
    </div>
  )
}

export function NotasSidebar({
  world,
  section,
  sections,
  onChangeWorld,
  onChangeSection,
  onSectionIntent,
  onWorldIntent,
  onOpenSearch,
  onOpenSettings,
  collapsed = false,
  onToggleCollapsed,
}: {
  world: World
  section: NotasSection
  /** Secciones visibles a renderizar (filtradas por las prefs del usuario). */
  sections: NotasSectionMeta[]
  onChangeWorld: (w: World) => void
  onChangeSection: (section: NotasSection) => void
  onSectionIntent?: (section: NotasSection) => void
  onWorldIntent?: (world: World) => void
  onOpenSearch: () => void
  /** Abre el panel de Configuración (mismo que el mundo principal). */
  onOpenSettings: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  if (collapsed) {
    return (
      <aside className="surface-sidebar hidden w-14 shrink-0 border-r border-ink-100 md:flex flex-col items-center">
        <header className="px-2 py-3 space-y-2">
          <WorldSwitcher
            world={world}
            onChangeWorld={onChangeWorld}
            onWorldIntent={onWorldIntent}
            collapsed
          />
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Expandir barra de Notas"
            title="Expandir barra de Notas"
            className="touch-target flex size-9 items-center justify-center rounded-md border border-ink-100/70 bg-paper-50 text-ink-400 hover:border-ink-200 hover:text-ink-700 transition-colors"
          >
            <ChevronRightIcon size={14} />
          </button>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Buscar en Notas"
            title="Buscar en Notas"
            className="touch-target flex size-9 items-center justify-center rounded-md border border-ink-100/70 bg-paper-50 text-ink-400 hover:border-ink-200 hover:text-ink-700 transition-colors"
          >
            <SearchIcon size={14} />
          </button>
        </header>
        <nav className="flex flex-col items-center gap-1 px-2">
          {sections.map((s) => {
            const Icon = s.icon
            const active = section === s.id
            return (
              <button
                key={s.id}
                type="button"
                onFocus={() => onSectionIntent?.(s.id)}
                onMouseEnter={() => onSectionIntent?.(s.id)}
                onClick={() => onChangeSection(s.id)}
                aria-label={s.label}
                aria-current={active ? 'page' : undefined}
                title={s.label}
                className={`relative flex size-9 items-center justify-center rounded-md transition-colors ${
                  active
                    ? 'text-ink-800 bg-ink-100/70'
                    : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100/60'
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r"
                    style={{ backgroundColor: ACCENT }}
                  />
                )}
                <span style={active ? { color: ACCENT } : undefined}>
                  <Icon size={15} />
                </span>
              </button>
            )
          })}
        </nav>
        <div className="flex-1" />
        <div className="px-2 pb-2 pt-2 border-t border-ink-100">
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Configuración"
            title="Configuración"
            className="touch-target flex size-9 items-center justify-center rounded-md text-ink-400 hover:text-ink-800 hover:bg-ink-100/60 transition-colors"
          >
            <SettingsIcon size={15} />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="surface-sidebar w-60 shrink-0 border-r border-ink-100 hidden md:flex flex-col">
      <header className="px-3 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <WorldSwitcher
              world={world}
              onChangeWorld={onChangeWorld}
              onWorldIntent={onWorldIntent}
            />
          </div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Colapsar barra de Notas"
            title="Colapsar barra de Notas"
            className="touch-target flex size-8 shrink-0 items-center justify-center rounded-md border border-ink-100/70 bg-paper-50 text-ink-400 hover:border-ink-200 hover:text-ink-700 transition-colors"
          >
            <ChevronLeftIcon size={14} />
          </button>
        </div>
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-paper-50 border border-ink-100/70 text-ink-400 hover:text-ink-700 hover:border-ink-200 transition-colors"
        >
          <SearchIcon size={12} className="shrink-0" />
          <span className="text-sm">Buscar…</span>
        </button>
      </header>
      <nav className="flex flex-col px-2 gap-px">
        {sections.map((s) => {
          const Icon = s.icon
          const active = section === s.id
          return (
            <button
              key={s.id}
              onFocus={() => onSectionIntent?.(s.id)}
              onMouseEnter={() => onSectionIntent?.(s.id)}
              onClick={() => onChangeSection(s.id)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex items-center gap-2.5 pl-3 pr-2.5 py-1.5 rounded-md text-body transition-colors ${
                active
                  ? 'text-ink-800 font-medium'
                  : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100/60'
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r"
                  style={{ backgroundColor: ACCENT }}
                />
              )}
              <span
                className="inline-flex shrink-0"
                style={active ? { color: ACCENT } : undefined}
              >
                <Icon size={14} />
              </span>
              <span>{s.label}</span>
            </button>
          )
        })}
      </nav>
      <div className="flex-1" />
      {/* Pie con los mismos controles que el mundo principal: activación de
          IA + acceso a Configuración. Antes el mundo Notas no los exponía. */}
      <div className="px-2 pt-2 pb-2 border-t border-ink-100 space-y-px">
        <AIModeToggle />
        <button
          onClick={onOpenSettings}
          className="touch-target w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-body text-ink-500 hover:text-ink-800 hover:bg-ink-100/60 transition-colors"
        >
          <SettingsIcon size={14} className="text-ink-400" />
          <span className="flex-1 text-left">Configuración</span>
        </button>
        <p className="text-micro uppercase tracking-wider text-ink-300 text-center pt-2 pb-0.5">
          trama · notas
        </p>
      </div>
    </aside>
  )
}

export function NotasMobileTabs({
  world,
  section,
  sections,
  onChangeWorld,
  onChangeSection,
  onSectionIntent,
  onWorldIntent,
  onOpenSearch,
  onOpenSettings,
}: {
  world: World
  section: NotasSection
  sections: NotasSectionMeta[]
  onChangeWorld: (w: World) => void
  onChangeSection: (section: NotasSection) => void
  onSectionIntent?: (section: NotasSection) => void
  onWorldIntent?: (world: World) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
}) {
  return (
    <div className="md:hidden border-b border-ink-100 flex items-center gap-2 px-3 py-2 surface-sidebar">
      <WorldSwitcher
        world={world}
        onChangeWorld={onChangeWorld}
        onWorldIntent={onWorldIntent}
        collapsed
      />
      <div className="w-px h-5 bg-ink-100 shrink-0" />
      <div className="flex gap-1 overflow-x-auto flex-1">
        {sections.map((s) => {
          const active = section === s.id
          return (
            <button
              key={s.id}
              onFocus={() => onSectionIntent?.(s.id)}
              onMouseEnter={() => onSectionIntent?.(s.id)}
              onClick={() => onChangeSection(s.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                active ? 'text-ink-800 font-medium bg-ink-100/60' : 'text-ink-500'
              }`}
              style={active ? { color: ACCENT } : undefined}
            >
              <s.icon size={14} />
              {s.label}
            </button>
          )
        })}
      </div>
      <button
        onClick={onOpenSearch}
        aria-label="Buscar"
        className="touch-target shrink-0 p-1.5 rounded-md text-ink-400 hover:text-ink-700 transition-colors"
      >
        <SearchIcon size={14} />
      </button>
      <button
        onClick={onOpenSettings}
        aria-label="Configuración"
        className="touch-target shrink-0 p-1.5 rounded-md text-ink-400 hover:text-ink-700 transition-colors"
      >
        <SettingsIcon size={14} />
      </button>
    </div>
  )
}
