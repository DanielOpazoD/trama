import {
  FilePdfIcon,
  HomeIcon,
  KeyIcon,
  NotesIcon,
  PromptIcon,
  SearchIcon,
  TasksIcon,
} from '../Icons'
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
  tareas: { label: 'Tareas', icon: TasksIcon },
  prompts: { label: 'Prompts', icon: PromptIcon },
  claves: { label: 'Claves', icon: KeyIcon },
  pdf: { label: 'PDF', icon: FilePdfIcon },
}

export const SECTIONS: NotasSectionMeta[] = NOTAS_SECTIONS.map((id) => ({
  id,
  ...SECTION_META_BY_ID[id],
}))

const SECTION_META: Record<NotasSection, { title: string; subtitle: string }> = {
  inicio: { title: 'Inicio', subtitle: 'mundo notas' },
  notas: { title: 'Notas', subtitle: 'capturas y anexos' },
  tareas: { title: 'Tareas', subtitle: 'recordatorios de la semana' },
  prompts: { title: 'Prompts', subtitle: 'biblioteca reutilizable' },
  claves: { title: 'Claves', subtitle: 'vault seguro' },
  pdf: { title: 'PDF', subtitle: 'combinar y editar' },
}

export function NotasTopBar({ section }: { section: NotasSection }) {
  return (
    <div className="animate-shell-topbar">
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
}: {
  world: World
  section: NotasSection
  /** Secciones visibles a renderizar (filtradas por las prefs del usuario). */
  sections: NotasSectionMeta[]
  onChangeWorld: (w: World) => void
  onChangeSection: (section: NotasSection) => void
  onOpenSearch: () => void
}) {
  return (
    <aside className="surface-sidebar w-60 shrink-0 border-r border-ink-100 hidden md:flex flex-col">
      <header className="px-3 py-3 space-y-2">
        <WorldSwitcher world={world} onChangeWorld={onChangeWorld} />
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-paper-50 border border-ink-100/70 text-ink-400 hover:text-ink-700 hover:border-ink-200 transition-colors"
        >
          <SearchIcon size={13} className="shrink-0" />
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
      <p className="text-micro uppercase tracking-wider text-ink-300 text-center pb-3">
        trama · notas
      </p>
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
}: {
  world: World
  section: NotasSection
  sections: NotasSectionMeta[]
  onChangeWorld: (w: World) => void
  onChangeSection: (section: NotasSection) => void
  onOpenSearch: () => void
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
        <SearchIcon size={16} />
      </button>
    </div>
  )
}
