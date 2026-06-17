import { createPortal } from 'react-dom'
import { useAnchoredPopover } from '../hooks/useAnchoredPopover'
import { TramaMark, NotesIcon, ChevronDownIcon, CheckIcon } from './Icons'
import type { World } from '../types/world'

/**
 * τ-worlds: el conmutador de mundos vive en el logo. Clic en la marca abre
 * un menú con los mundos disponibles (Trama, Notas, …) y al elegir uno se
 * cambia de workspace. Reemplaza al riel fijo — cero chrome permanente, y
 * escala cuando se sumen más mundos. Va en el header de CADA mundo para que
 * el cambio esté siempre a mano.
 *
 * `collapsed`: variante solo-marca (sidebar contraído de la Trama / TopBar
 * móvil). El menú es idéntico en ambos casos.
 *
 * El menú se renderiza con un PORTAL al `document.body` y se ancla por
 * coordenadas al trigger. Razón: si vive como hijo del TopBar, queda atrapado
 * en el stacking context de esa barra (z-auto) y la navegación móvil —un flex
 * item con `z-nav`— lo pinta por encima. Portalearlo lo saca a la raíz, donde
 * `z-dropdown` (40) sí gana sobre `z-nav` (30). Antes, además, el dropdown
 * `absolute` se volvía `relative` por `.paper-grain` y empujaba la barra; eso
 * se arregló en index.css, pero el portal es lo que garantiza el apilamiento.
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

const MENU_WIDTH = 240 // px — coincide con w-60; usado para clampear al viewport
const VIEWPORT_MARGIN = 12 // px de aire contra los bordes

export function preloadWorld(world: World): void {
  if (world === 'notas') void import('./notas/NotasWorld')
}

export function WorldSwitcher({
  world,
  onChangeWorld,
  collapsed = false,
}: {
  world: World
  onChangeWorld: (w: World) => void
  collapsed?: boolean
}) {
  const popover = useAnchoredPopover({
    horizontal: 'left',
    layerWidth: MENU_WIDTH,
    viewportMargin: VIEWPORT_MARGIN,
  })

  const current = WORLDS.find((w) => w.id === world) ?? WORLDS[0]!

  return (
    <div className="min-w-0">
      <button
        ref={popover.triggerRef}
        type="button"
        onClick={popover.toggle}
        aria-haspopup="menu"
        aria-expanded={popover.open}
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

      {popover.open &&
        popover.position &&
        createPortal(
          <div
            ref={popover.layerRef}
            role="menu"
            style={{
              top: popover.position.top,
              bottom: popover.position.bottom,
              left: popover.position.left,
            }}
            className="fixed z-dropdown w-60 max-w-[calc(100vw-1.5rem)] paper-grain rounded-xl border border-ink-100/60 bg-paper-50/95 backdrop-blur-md shadow-lg shadow-ink-900/10 p-1.5 animate-fade-up origin-top motion-reduce:animate-none"
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
                  onFocus={() => preloadWorld(w.id)}
                  onMouseEnter={() => preloadWorld(w.id)}
                  onClick={() => {
                    onChangeWorld(w.id)
                    popover.close()
                  }}
                  className={`w-full flex items-start gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors ${
                    active ? 'bg-ink-100/70' : 'hover:bg-ink-100/50'
                  }`}
                >
                  <span
                    className="mt-0.5 inline-flex shrink-0"
                    style={{ color: w.accent }}
                  >
                    <Icon size={14} />
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
          </div>,
          document.body,
        )}
    </div>
  )
}
