import { SearchIcon, SettingsIcon } from '../Icons'
import { IconButton } from '../IconButton'
import { AIModeToggle } from '../AIModeToggle'
import { TopBar } from '../TopBar'
import { WorldSwitcher } from '../WorldSwitcher'
import type { World } from '../../types/world'
import type { NotasSection } from '../../types/notas'
import { NOTAS_SECTION_TITLES, type NotasSectionMeta } from './notasSections'
import { NavButton } from '../sidebar/NavButton'
import {
  SidebarBrandLine,
  SidebarCollapseButton,
  SidebarResizeHandle,
  SidebarSearchTrigger,
  SidebarSettingsButton,
  useSidebarWidth,
} from '../sidebar/sidebarChrome'

const ACCENT = 'var(--accent-sage)'

export function NotasTopBar({ section }: { section: NotasSection }) {
  return (
    <div>
      {/* Solo el título utilitario: el descriptor duplicaba al hero de la
          vista (jerarquía doble) y el subtítulo ya vive allí. */}
      <TopBar
        view="inicio"
        titleOverride={{ title: NOTAS_SECTION_TITLES[section].title }}
      />
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
  const sidebarWidth = useSidebarWidth()

  if (collapsed) {
    return (
      <aside className="surface-sidebar hidden w-14 shrink-0 border-r border-ink-100 md:flex flex-col items-center py-4 gap-1">
        <div className="mb-2">
          <WorldSwitcher
            world={world}
            onChangeWorld={onChangeWorld}
            onWorldIntent={onWorldIntent}
            collapsed
          />
        </div>
        <SidebarCollapseButton
          collapsed
          label="Expandir barra de Notas"
          onClick={onToggleCollapsed}
        />
        <IconButton
          onClick={onOpenSearch}
          label="Buscar en Notas"
          title="Buscar en Notas"
          className="touch-target flex size-7 items-center justify-center rounded-md text-ink-400 hover:text-ink-700 hover:bg-ink-100/70 transition-colors"
        >
          <SearchIcon size={14} />
        </IconButton>
        <div className="w-7 h-px bg-ink-100/70 my-2" />
        <nav className="flex flex-col items-center gap-1">
          {sections.map((s) => (
            <div
              key={s.id}
              onFocus={() => onSectionIntent?.(s.id)}
              onMouseEnter={() => onSectionIntent?.(s.id)}
            >
              <NavButton
                item={{ value: s.id, label: s.label, icon: s.icon }}
                active={section === s.id}
                count={null}
                mode="collapsed"
                accentColor={ACCENT}
                onClick={() => onChangeSection(s.id)}
              />
            </div>
          ))}
        </nav>
        <div className="mt-auto">
          <SidebarSettingsButton onClick={onOpenSettings} />
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="surface-sidebar relative shrink-0 border-r border-ink-100 hidden md:flex flex-col"
      style={{ width: sidebarWidth.width }}
    >
      <SidebarResizeHandle
        resizing={sidebarWidth.resizing}
        onPointerDown={sidebarWidth.startResize}
        onDoubleClick={sidebarWidth.resetWidth}
        onKeyDown={sidebarWidth.nudgeWidth}
      />
      <header className="px-3 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <WorldSwitcher
            world={world}
            onChangeWorld={onChangeWorld}
            onWorldIntent={onWorldIntent}
          />
        </div>
        <SidebarCollapseButton
          collapsed={false}
          label="Colapsar barra de Notas"
          onClick={onToggleCollapsed}
        />
      </header>
      <div className="px-2 mb-1.5">
        <SidebarSearchTrigger ariaLabel="Buscar en Notas" onClick={onOpenSearch} />
      </div>
      <nav className="flex flex-col px-2 gap-px flex-1 min-h-0 overflow-y-auto">
        {sections.map((s) => (
          <div
            key={s.id}
            onFocus={() => onSectionIntent?.(s.id)}
            onMouseEnter={() => onSectionIntent?.(s.id)}
          >
            <NavButton
              item={{ value: s.id, label: s.label, icon: s.icon }}
              active={section === s.id}
              count={null}
              mode="expanded"
              accentColor={ACCENT}
              onClick={() => onChangeSection(s.id)}
            />
          </div>
        ))}
      </nav>
      {/* Mismo pie que el mundo principal: IA + Configuración como ícono +
          la firma de versión anclando el borde inferior. */}
      <div className="px-2 pt-2 pb-2 border-t border-ink-100 space-y-1">
        <AIModeToggle />
        <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
          <SidebarSettingsButton onClick={onOpenSettings} />
          <SidebarBrandLine />
        </div>
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
      <IconButton
        onClick={onOpenSearch}
        label="Buscar"
        className="touch-target shrink-0 p-1.5 rounded-md text-ink-400 hover:text-ink-700 transition-colors"
      >
        <SearchIcon size={14} />
      </IconButton>
      <IconButton
        onClick={onOpenSettings}
        label="Configuración"
        className="touch-target shrink-0 p-1.5 rounded-md text-ink-400 hover:text-ink-700 transition-colors"
      >
        <SettingsIcon size={14} />
      </IconButton>
    </div>
  )
}
