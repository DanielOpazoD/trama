import { useState } from 'react'
import {
  useCountsQuery,
  useMomentoShareInvitationsQuery,
  useProactiveQuery,
} from '../state'
import type { ViewMode } from '../types/view'
import { SECTION_ACCENT } from '../lib/sectionAccent'
import { MOBILE_PRIMARY_ITEMS, MOBILE_MORE_VIEWS } from '../lib/navigation'
import { MobileMoreSheet } from './MobileMoreSheet'
import { CountBadge } from './CountBadge'

/**
 * Barra de navegación principal en móvil. Reemplaza al Sidebar cuando el
 * viewport es < md y vive en el borde SUPERIOR (dentro del <main>, bajo el
 * TopBar), unificada con el header del mundo Notas.
 *
 * τ-nav: muestra 4 vistas primarias + un botón "Más" (5 slots = el límite
 * cómodo para el pulgar). Antes apretaba 7 ítems a ~53px y, peor, dejaba 5
 * vistas inalcanzables en móvil (Escuchas, Twitter, Cronología, Atlas,
 * Sugerencias) porque no cabían. "Más" abre una hoja con TODO el resto. La
 * lista de vistas vive en src/lib/navigation.ts (fuente única, compartida con
 * el Sidebar).
 *
 * Diseño:
 *   - Iconos en una fila, distribuidos uniformes.
 *   - Icono ink-400 inactivo, color de sección activo.
 *   - Micro-dot bajo el icono activo (más sutil que un underline).
 *   - "Más" se ilumina con el color de la vista activa cuando estás en una
 *     vista que vive dentro de la hoja — así sabés dónde estás.
 */
export function MobileBottomNav({
  view,
  onChangeView,
}: {
  view: ViewMode
  onChangeView: (v: ViewMode) => void
}) {
  const { data: totals } = useCountsQuery()
  const { data: shareInvitations } = useMomentoShareInvitationsQuery()
  const { data: proactive } = useProactiveQuery()
  const pendingShareInvitations = shareInvitations?.items?.length ?? 0
  const pendingSuggestions = proactive?.length ?? 0

  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = MOBILE_MORE_VIEWS.includes(view)

  return (
    <>
      <nav
        aria-label="Navegación principal"
        // Barra SUPERIOR en móvil: vive dentro del <main>, justo debajo del
        // TopBar. shrink-0 para que no se comprima. z-nav la mantiene sobre el
        // contenido pero bajo overlays (dropdown/modal).
        className="shrink-0 z-nav bg-paper-50/95 backdrop-blur-md border-b border-ink-100/70"
      >
        <ul className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
          {MOBILE_PRIMARY_ITEMS.map((item) => {
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
                    <CountBadge
                      count={noticeCount}
                      className="absolute -right-1 -top-1 min-w-[14px] rounded-full px-1 text-center text-[9px] leading-[14px] text-paper-50"
                      style={{ backgroundColor: 'var(--accent-gold)' }}
                    />
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

          {/* "Más" — abre la hoja con el resto de las vistas. */}
          <li className="flex-1 min-w-0">
            <button
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-current={moreActive ? 'page' : undefined}
              aria-label={
                pendingSuggestions > 0
                  ? `Más vistas, ${pendingSuggestions} sugerencia${
                      pendingSuggestions === 1 ? '' : 's'
                    } pendiente${pendingSuggestions === 1 ? '' : 's'}`
                  : 'Más vistas'
              }
              className="touch-target w-full h-full flex flex-col items-center justify-center gap-0.5 py-1 relative transition-colors"
              style={{
                color: moreActive ? SECTION_ACCENT[view] : 'rgb(var(--ink-400))',
              }}
            >
              <span className="relative">
                {/* Ellipsis horizontal — afordancia universal de "más". */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
                {pendingSuggestions > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 size-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--accent-gold)' }}
                  />
                )}
              </span>
              <span
                className="text-micro leading-tight tracking-tight font-medium truncate max-w-full px-1"
                style={{ opacity: moreActive ? 1 : 0.7 }}
              >
                Más
              </span>
              {moreActive && (
                <span
                  className="absolute bottom-0.5 size-1 rounded-full"
                  style={{ backgroundColor: SECTION_ACCENT[view] }}
                  aria-hidden
                />
              )}
            </button>
          </li>
        </ul>
      </nav>

      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        view={view}
        onChangeView={onChangeView}
      />
    </>
  )
}
