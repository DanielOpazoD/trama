import { HomeIcon, KeyIcon, NotesIcon, PromptIcon, TasksIcon } from '../Icons'
import { WorldSwitcher } from '../WorldSwitcher'
import type { World } from '../../types/world'
import type { NotasDensity, NotasSection } from './NotasWorld'

const ACCENT = 'var(--accent-sage)'

const SECTIONS: Array<{
  id: NotasSection
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}> = [
  { id: 'inicio', label: 'Inicio', icon: HomeIcon },
  { id: 'notas', label: 'Notas', icon: NotesIcon },
  { id: 'tareas', label: 'Tareas', icon: TasksIcon },
  { id: 'prompts', label: 'Prompts', icon: PromptIcon },
  { id: 'claves', label: 'Claves', icon: KeyIcon },
]

export function NotasSidebar({
  world,
  section,
  onChangeWorld,
  onChangeSection,
}: {
  world: World
  section: NotasSection
  onChangeWorld: (w: World) => void
  onChangeSection: (section: NotasSection) => void
}) {
  return (
    <aside className="surface-sidebar w-60 shrink-0 border-r border-ink-100 hidden md:flex flex-col">
      <header className="px-3 py-3">
        <WorldSwitcher world={world} onChangeWorld={onChangeWorld} />
      </header>
      <nav className="flex flex-col px-2 gap-px">
        {SECTIONS.map((s) => {
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
  onChangeWorld,
  onChangeSection,
}: {
  world: World
  section: NotasSection
  onChangeWorld: (w: World) => void
  onChangeSection: (section: NotasSection) => void
}) {
  return (
    <div className="md:hidden border-b border-ink-100 flex items-center gap-2 px-3 py-2 surface-sidebar">
      <WorldSwitcher world={world} onChangeWorld={onChangeWorld} collapsed />
      <div className="w-px h-5 bg-ink-100 shrink-0" />
      <div className="flex gap-1 overflow-x-auto">
        {SECTIONS.map((s) => {
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
    </div>
  )
}

export function NotasDensityToggle({
  density,
  onChangeDensity,
}: {
  density: NotasDensity
  onChangeDensity: (density: NotasDensity) => void
}) {
  const compact = density === 'compact'
  return (
    <div className="mb-4 flex justify-end">
      <div className="inline-flex rounded-md border border-ink-100 bg-paper-50 p-0.5">
        <button
          type="button"
          onClick={() => onChangeDensity('comfortable')}
          aria-pressed={!compact}
          className={`px-2.5 py-1 text-micro uppercase tracking-eyebrow rounded ${
            compact ? 'text-ink-300 hover:text-ink-700' : 'bg-white text-ink-700'
          }`}
        >
          Modo cómodo
        </button>
        <button
          type="button"
          onClick={() => onChangeDensity('compact')}
          aria-pressed={compact}
          className={`px-2.5 py-1 text-micro uppercase tracking-eyebrow rounded ${
            compact ? 'bg-white text-ink-700' : 'text-ink-300 hover:text-ink-700'
          }`}
        >
          Modo compacto
        </button>
      </div>
    </div>
  )
}
