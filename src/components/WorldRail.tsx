import { Tooltip } from './Tooltip'
import { TramaMark, NotesIcon } from './Icons'
import type { World } from '../types/world'

/**
 * τ-worlds: el riel de mundos — la barra más a la izquierda, fija, que
 * conmuta entre los workspaces de Trama. Cada mundo abre su propia sub-barra
 * y contenido (ver WorldShell). Patrón "activity bar" (VS Code / Obsidian).
 *
 * El primer mundo (Trama) usa la marca como ícono: hace de "home" y de
 * identidad de la app. Los demás usan íconos de línea.
 */
type WorldDef = {
  id: World
  label: string
  hint: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  accent: string
}

const WORLDS: WorldDef[] = [
  {
    id: 'trama',
    label: 'Trama',
    hint: 'El mapa: entidades, citas, momentos, miradas',
    icon: TramaMark,
    accent: 'var(--accent-primary)',
  },
  {
    id: 'notas',
    label: 'Notas',
    hint: 'Apuntes rápidos y tareas',
    icon: NotesIcon,
    accent: 'var(--accent-sage)',
  },
]

export function WorldRail({
  world,
  onChangeWorld,
}: {
  world: World
  onChangeWorld: (w: World) => void
}) {
  return (
    <nav
      aria-label="Mundos"
      className="surface-sidebar shrink-0 w-14 h-full border-r border-ink-100 flex flex-col items-center py-3 gap-1.5 z-30"
    >
      {WORLDS.map((w) => {
        const Icon = w.icon
        const active = world === w.id
        return (
          <Tooltip key={w.id} content={w.hint} side="bottom">
            <button
              onClick={() => onChangeWorld(w.id)}
              aria-label={w.label}
              aria-current={active ? 'page' : undefined}
              className={`relative w-full flex flex-col items-center gap-1 py-2 rounded-lg transition-colors active:scale-95 ${
                active
                  ? 'text-ink-800 bg-ink-100/50'
                  : 'text-ink-400 hover:text-ink-700 hover:bg-ink-100/40'
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
                  style={{ backgroundColor: w.accent }}
                />
              )}
              <span
                className="inline-flex"
                style={active ? { color: w.accent } : undefined}
              >
                <Icon size={20} />
              </span>
              <span className="text-micro leading-none tracking-tight font-medium">
                {w.label}
              </span>
            </button>
          </Tooltip>
        )
      })}
    </nav>
  )
}
