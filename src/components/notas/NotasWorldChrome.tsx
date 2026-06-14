import {
  ClipboardIcon,
  FilePdfIcon,
  HomeIcon,
  KeyIcon,
  NotesIcon,
  PromptIcon,
  ScissorsIcon,
  SearchIcon,
  SettingsIcon,
  TasksIcon,
} from '../Icons'
import { AIModeToggle } from '../AIModeToggle'
import { TopBar } from '../TopBar'
import { WorldSwitcher } from '../WorldSwitcher'
import type { World } from '../../types/world'
import { NOTAS_SECTIONS, type NotasSection } from '../../types/notas'

const ACCENT = 'var(--accent-sage)'

export type NotasSectionMeta = {
  id: NotasSection
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

/** Registro canónico de las secciones del mundo Notas (orden de la chrome). */
const SECTION_META_BY_ID: Record<NotasSection, Omit<NotasSectionMeta, 'id'>> = {
  inicio: { label: 'Inicio', icon: HomeIcon },
  notas: { label: 'Notas', icon: NotesIcon },
  bandeja: { label: 'Bandeja', icon: ScissorsIcon },
  tareas: { label: 'Tareas', icon: TasksIcon },
  prompts: { label: 'Prompts', icon: PromptIcon },
  claves: { label: 'Claves', icon: KeyIcon },
  pdf: { label: 'Imprenta', icon: FilePdfIcon },
  planillas: { label: 'Planillas', icon: ClipboardIcon },
}

export const SECTIONS: NotasSectionMeta[] = NOTAS_SECTIONS.map((id) => ({
  id,
  ...SECTION_META_BY_ID[id],
}))

const SECTION_META: Record<NotasSection, { title: string; subtitle: string }> = {
  inicio: { title: 'Inicio', subtitle: 'mundo notas' },
  notas: { title: 'Notas', subtitle: 'capturas y anexos' },
  bandeja: { title: 'Bandeja', subtitle: 'capturas esperando curaduría' },
  tareas: { title: 'Tareas', subtitle: 'recordatorios de la semana' },
  prompts: { title: 'Prompts', subtitle: 'biblioteca reutilizable' },
  claves: { title: 'Claves', subtitle: 'bajo llave' },
  pdf: { title: 'Imprenta', subtitle: 'editar PDF' },
  planillas: { title: 'Planillas', subtitle: 'rellenar e imprimir' },
}

export function NotasTopBar({ section }: { section: NotasSection }) {
  return (
    <div>
      <TopBar view="inicio" titleOverride={SECTION_META[section]} />
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
  onOpenSearch,
  onOpenSettings,
}: {
  world: World
  section: NotasSection
  /** Secciones visibles a renderizar (filtradas por las prefs del usuario). */
  sections: NotasSectionMeta[]
  onChangeWorld: (w: World) => void
  onChangeSection: (section: NotasSection) => void
  onOpenSearch: () => void
  /** Abre el panel de Configuración (mismo que el mundo principal). */
  onOpenSettings: () => void
}) {
  return (
    <aside className="surface-sidebar w-60 shrink-0 border-r border-ink-100 hidden md:flex flex-col">
      <header className="px-3 py-3 space-y-2">
        <WorldSwitcher world={world} onChangeWorld={onChangeWorld} />
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
  onOpenSearch,
  onOpenSettings,
}: {
  world: World
  section: NotasSection
  sections: NotasSectionMeta[]
  onChangeWorld: (w: World) => void
  onChangeSection: (section: NotasSection) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
}) {
  return (
    <div className="md:hidden border-b border-ink-100 flex items-center gap-2 px-3 py-2 surface-sidebar">
      <WorldSwitcher world={world} onChangeWorld={onChangeWorld} collapsed />
      <div className="w-px h-5 bg-ink-100 shrink-0" />
      <div className="flex gap-1 overflow-x-auto flex-1">
        {sections.map((s) => {
          const active = section === s.id
          return (
            <button
              key={s.id}
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
