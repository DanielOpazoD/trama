import { useProactiveQuery, useCountsQuery } from '../state'
import {
  AtlasIcon,
  ChatIcon,
  CronologiaIcon,
  EntitiesIcon,
  GabineteIcon,
  GraphIcon,
  HomeIcon,
  MomentosIcon,
  MusicIcon,
  QuoteIcon,
  SparkleIcon,
  TwitterIcon,
} from './Icons'
import type { ViewMode } from './Sidebar'
import { SECTION_ACCENT } from '../lib/sectionAccent'

/**
 * Bottom navigation bar para mobile. Reemplaza al Sidebar cuando el
 * viewport es < md. Los 8 nav items se acomodan como una grid de iconos
 * con micro-labels debajo; el activo se distingue con un dot del color
 * de la sección (mismo `SECTION_ACCENT` que el sidebar desktop).
 *
 * Diseño:
 *   - 8 iconos en una fila, distribuidos uniformes (12px gap interno).
 *   - Cada item es un botón de 44×52 (touch target compliant).
 *   - Icono ink-400 cuando inactivo, color de sección cuando activo.
 *   - Micro-dot abajo del icono activo (más sutil que tab underline).
 *   - El bottom-bar tiene paper-50/95 + backdrop-blur + border-t.
 *   - Badge dot encima del icono cuando hay count pendiente
 *     (Sugerencias).
 *
 * Safe area: agregamos pb-safe (vía env(safe-area-inset-bottom)) para
 * que en iPhones con notch + home indicator no se corte el contenido.
 */

// τ-IA: el orden replica los grupos del Sidebar (Mi trama → Miradas →
// Diálogo). En la barra inferior no caben rótulos de grupo, pero mantener
// el mismo orden que el desktop preserva el modelo mental: el material
// primero, las tres miradas de conjunto juntas, la conversación al final.
const NAV_ITEMS: Array<{
  value: ViewMode
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}> = [
  { value: 'inicio', label: 'Inicio', icon: HomeIcon },
  { value: 'entidades', label: 'Entidades', icon: EntitiesIcon },
  { value: 'citas', label: 'Citas', icon: QuoteIcon },
  { value: 'momentos', label: 'Momentos', icon: MomentosIcon },
  { value: 'escuchas', label: 'Escuchas', icon: MusicIcon },
  { value: 'twitter', label: 'Twitter', icon: TwitterIcon },
  { value: 'grafo', label: 'Grafo', icon: GraphIcon },
  { value: 'cronologia', label: 'Cronología', icon: CronologiaIcon },
  { value: 'atlas', label: 'Atlas', icon: AtlasIcon },
  { value: 'chat', label: 'Chat', icon: ChatIcon },
  { value: 'sugerencias', label: 'Sugerencias', icon: SparkleIcon },
  { value: 'gabinete', label: 'Gabinete', icon: GabineteIcon },
]

export function MobileBottomNav({
  view,
  onChangeView,
}: {
  view: ViewMode
  onChangeView: (v: ViewMode) => void
}) {
  const { data: pendingSuggestions = [] } = useProactiveQuery()
  const { data: totals } = useCountsQuery()
  const pendingCount = pendingSuggestions.length

  return (
    <nav
      aria-label="Navegación principal"
      // Vive en el flow como flex child del root (que en mobile es
      // flex-col). shrink-0 garantiza que no se comprime; el main
      // toma el resto del viewport. Esto deja la AskBar (anclada al
      // bottom del <main>) automáticamente encima de la nav.
      className="shrink-0 z-30 bg-paper-50/95 backdrop-blur-md border-t border-ink-100/70 animate-shell-sidebar"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = view === item.value
          const showBadge = item.value === 'sugerencias' && pendingCount > 0
          const count =
            item.value === 'entidades'
              ? totals?.entities
              : item.value === 'citas'
                ? totals?.quotes
                : item.value === 'momentos'
                  ? totals?.momentos
                  : undefined

          return (
            <li key={item.value} className="flex-1 min-w-0">
              <button
                onClick={() => onChangeView(item.value)}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className="touch-target w-full h-full flex flex-col items-center justify-center gap-0.5 py-1 relative transition-colors"
                style={{
                  color: active ? SECTION_ACCENT[item.value] : 'rgb(var(--ink-400))',
                }}
              >
                <span className="relative">
                  <Icon size={20} />
                  {showBadge && (
                    <span
                      className="absolute -top-1 -right-1.5 size-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                      aria-hidden
                    />
                  )}
                </span>
                <span
                  className="text-micro leading-tight tracking-tight font-medium truncate max-w-full px-1"
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    opacity: active ? 1 : 0.7,
                  }}
                >
                  {item.label}
                  {count !== undefined && count > 0 && active && (
                    <span className="ml-1 text-ink-300">{count}</span>
                  )}
                </span>
                {/* Dot indicador del activo — más sutil que el bar
                    underline tradicional. Sentado bajo el label. */}
                {active && (
                  <span
                    className="absolute bottom-0.5 size-1 rounded-full"
                    style={{ backgroundColor: SECTION_ACCENT[item.value] }}
                    aria-hidden
                  />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
