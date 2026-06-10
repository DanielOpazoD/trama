import { useCountsQuery, useMomentoShareInvitationsQuery } from '../state'
import {
  ChatIcon,
  EntitiesIcon,
  GraphIcon,
  HomeIcon,
  MomentosIcon,
  QuoteIcon,
} from './Icons'
import type { ViewMode } from './Sidebar'
import { SECTION_ACCENT } from '../lib/sectionAccent'

/**
 * Barra de navegación principal en móvil. Reemplaza al Sidebar cuando el
 * viewport es < md y vive en el borde SUPERIOR (dentro del <main>, bajo el
 * TopBar), unificada con el header del mundo Notas. Los items se acomodan como
 * una fila de iconos con micro-labels; el activo se distingue con un dot del
 * color de la sección (mismo `SECTION_ACCENT` que el sidebar desktop).
 *
 * Diseño:
 *   - Iconos en una fila, distribuidos uniformes.
 *   - Cada item es un botón touch-target compliant.
 *   - Icono ink-400 cuando inactivo, color de sección cuando activo.
 *   - Micro-dot bajo el icono activo (más sutil que un tab underline).
 *   - paper-50/95 + backdrop-blur + border-b (separa del contenido).
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
  { value: 'grafo', label: 'Grafo', icon: GraphIcon },
  { value: 'chat', label: 'Chat', icon: ChatIcon },
]

export function MobileBottomNav({
  view,
  onChangeView,
}: {
  view: ViewMode
  onChangeView: (v: ViewMode) => void
}) {
  const { data: totals } = useCountsQuery()
  const { data: shareInvitations } = useMomentoShareInvitationsQuery()
  const pendingShareInvitations = shareInvitations?.items?.length ?? 0

  return (
    <nav
      aria-label="Navegación principal"
      // Barra SUPERIOR en móvil (unificada con el mundo Notas): vive dentro del
      // <main>, justo debajo del TopBar. shrink-0 para que no se comprima.
      className="shrink-0 z-30 bg-paper-50/95 backdrop-blur-md border-b border-ink-100/70"
    >
      <ul className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = view === item.value
          const noticeCount = item.value === 'momentos' ? pendingShareInvitations : 0
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
                aria-label={
                  noticeCount > 0
                    ? `${item.label} ${noticeCount} ${
                        noticeCount === 1 ? 'invitación' : 'invitaciones'
                      }`
                    : item.label
                }
                aria-current={active ? 'page' : undefined}
                className="touch-target w-full h-full flex flex-col items-center justify-center gap-0.5 py-1 relative transition-colors"
                style={{
                  color: active ? SECTION_ACCENT[item.value] : 'rgb(var(--ink-400))',
                }}
              >
                <span className="relative">
                  <Icon size={18} />
                  {noticeCount > 0 && (
                    <span
                      aria-hidden
                      className="absolute -right-1 -top-1 min-w-[14px] rounded-full px-1 text-center text-[9px] leading-[14px] text-paper-50"
                      style={{ backgroundColor: 'var(--accent-gold)' }}
                    >
                      {noticeCount}
                    </span>
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
