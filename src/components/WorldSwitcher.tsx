import { useEffect, useRef, useState } from 'react'
import { TramaMark, NotesIcon, ChevronDownIcon, CheckIcon } from './Icons'
import type { World } from '../types/world'

/**
 * τ-worlds: el conmutador de mundos vive en el logo. Clic en la marca abre
 * un menú con los mundos disponibles (Trama, Notas, …) y al elegir uno se
 * cambia de workspace. Reemplaza al riel fijo — cero chrome permanente, y
 * escala cuando se sumen más mundos. Va en el header de CADA mundo para que
 * el cambio esté siempre a mano.
 *
 * `collapsed`: variante solo-marca (sidebar contraído de la Trama); el menú
 * se abre a la derecha en vez de abajo.
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
    hint: 'Tu mapa: entidades, citas, momentos',
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

export function WorldSwitcher({
  world,
  onChangeWorld,
  collapsed = false,
}: {
  world: World
  onChangeWorld: (w: World) => void
  collapsed?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = WORLDS.find((w) => w.id === world) ?? WORLDS[0]!

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mundo actual: ${current.label}. Cambiar de mundo`}
        title="Cambiar de mundo"
        className={
          collapsed
            ? 'trama-mark-interactive p-1.5 rounded-md text-ink-700 hover:bg-ink-100/60 transition-colors'
            : 'trama-mark-interactive flex items-center gap-1.5 min-w-0 px-1.5 py-1 -ml-1.5 rounded-md hover:bg-ink-100/60 transition-colors'
        }
      >
        <span className="inline-flex shrink-0 text-ink-700">
          <TramaMark size={22} />
        </span>
        {!collapsed && (
          <>
            <span className="font-serif text-lg text-ink-800 leading-none tracking-tight truncate">
              {current.label}
            </span>
            <ChevronDownIcon size={12} className="text-ink-300 shrink-0" />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-50 w-60 paper-grain rounded-xl border border-ink-100/60 bg-paper-50/95 backdrop-blur-md shadow-lg shadow-ink-900/10 p-1.5 ${
            collapsed ? 'left-full ml-2 top-0' : 'left-0 top-full mt-1.5'
          }`}
        >
          <p className="px-2 pt-1 pb-1.5 text-micro uppercase tracking-eyebrow text-ink-300">
            Mundos
          </p>
          {WORLDS.map((w) => {
            const Icon = w.icon
            const active = w.id === world
            return (
              <button
                key={w.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChangeWorld(w.id)
                  setOpen(false)
                }}
                className={`w-full flex items-start gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors ${
                  active ? 'bg-ink-100/70' : 'hover:bg-ink-100/50'
                }`}
              >
                <span className="mt-0.5 inline-flex shrink-0" style={{ color: w.accent }}>
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`text-sm ${active ? 'text-ink-800 font-medium' : 'text-ink-700'}`}
                    >
                      {w.label}
                    </span>
                    {active && <CheckIcon size={12} className="text-ink-500" />}
                  </span>
                  <span className="block text-micro text-ink-400 leading-tight">
                    {w.hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
