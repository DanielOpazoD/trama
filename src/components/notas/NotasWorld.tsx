import { useState } from 'react'
import { HomeIcon, KeyIcon, NotesIcon, PromptIcon, TasksIcon } from '../Icons'
import { WorldSwitcher } from '../WorldSwitcher'
import { ClavesView } from './ClavesView'
import { NotasGlobalSearch } from './NotasGlobalSearch'
import { NotasHomeView } from './NotasHomeView'
import { NotasView } from './NotasView'
import { PromptsView } from './PromptsView'
import { TareasView } from './TareasView'
import type { World } from '../../types/world'

/**
 * τ-worlds: el mundo "Trama Notas" — un workspace de productividad liviana
 * (apuntes rápidos + tareas), independiente del mapa pero con puentes (p. ej.
 * promover una nota a Momento, en una fase posterior).
 *
 * Arma la sub-barra del mundo y sus secciones funcionales: inicio, notas,
 * tareas, prompts y claves.
 */
export type NotasSection = 'inicio' | 'notas' | 'tareas' | 'prompts' | 'claves'

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

const ACCENT = 'var(--accent-sage)'
const DENSITY_STORAGE_KEY = 'trama.notas.density'

type NotasDensity = 'comfortable' | 'compact'

function readInitialDensity(): NotasDensity {
  if (typeof window === 'undefined') return 'comfortable'
  return window.localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact'
    ? 'compact'
    : 'comfortable'
}

export function NotasWorld({
  world,
  onChangeWorld,
}: {
  world: World
  onChangeWorld: (w: World) => void
}) {
  const [section, setSection] = useState<NotasSection>('inicio')
  const [density, setDensity] = useState<NotasDensity>(readInitialDensity)
  const compact = density === 'compact'

  function changeDensity(next: NotasDensity) {
    setDensity(next)
    window.localStorage.setItem(DENSITY_STORAGE_KEY, next)
  }

  return (
    <div className="h-full w-full flex flex-col md:flex-row overflow-hidden">
      {/* Sub-barra del mundo Notas */}
      <aside className="surface-sidebar w-60 shrink-0 border-r border-ink-100 hidden md:flex flex-col">
        {/* τ-worlds: el logo conmuta de mundo (acá muestra "Notas"). */}
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
                onClick={() => setSection(s.id)}
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

      {/* Mobile: el conmutador de mundos + tabs (la sub-barra se oculta < md) */}
      <div className="md:hidden border-b border-ink-100 flex items-center gap-2 px-3 py-2 surface-sidebar">
        <WorldSwitcher world={world} onChangeWorld={onChangeWorld} collapsed />
        <div className="w-px h-5 bg-ink-100 shrink-0" />
        <div className="flex gap-1 overflow-x-auto">
          {SECTIONS.map((s) => {
            const active = section === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
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

      {/* Contenido */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        <div className="h-full overflow-y-auto">
          <div
            data-testid="notas-world-content"
            className={`px-5 md:px-8 pb-24 mx-auto transition-[max-width] ${
              compact ? 'py-5 md:py-7 max-w-6xl' : 'py-8 md:py-10 max-w-5xl'
            }`}
          >
            <div className="mb-4 flex justify-end">
              <div className="inline-flex rounded-md border border-ink-100 bg-paper-50 p-0.5">
                <button
                  type="button"
                  onClick={() => changeDensity('comfortable')}
                  aria-pressed={!compact}
                  className={`px-2.5 py-1 text-micro uppercase tracking-eyebrow rounded ${
                    compact ? 'text-ink-300 hover:text-ink-700' : 'bg-white text-ink-700'
                  }`}
                >
                  Modo cómodo
                </button>
                <button
                  type="button"
                  onClick={() => changeDensity('compact')}
                  aria-pressed={compact}
                  className={`px-2.5 py-1 text-micro uppercase tracking-eyebrow rounded ${
                    compact ? 'bg-white text-ink-700' : 'text-ink-300 hover:text-ink-700'
                  }`}
                >
                  Modo compacto
                </button>
              </div>
            </div>
            <NotasGlobalSearch onNavigate={setSection} />
            {section === 'inicio' && <NotasHomeView onNavigate={setSection} />}
            {section === 'notas' && <NotasView />}
            {section === 'tareas' && <TareasView />}
            {section === 'prompts' && <PromptsView />}
            {section === 'claves' && <ClavesView />}
          </div>
        </div>
      </main>
    </div>
  )
}
