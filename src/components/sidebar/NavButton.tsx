import { NumberTicker } from '../NumberTicker'
import { Tooltip } from '../Tooltip'
import type { ViewMode } from '../Sidebar'

/**
 * ε2: NavButton — el botón de navegación del sidebar, en sus dos modos
 * (expanded y collapsed). Antes vivía duplicado en Sidebar.tsx: cada
 * mejora al nav (γ4 aria-label, δ5 NumberTicker, δ8 sin parens) había
 * que aplicarla a las dos copias, y de hecho δ8 solo arregló una.
 *
 * Acá ambos modos comparten la misma fuente de verdad. La diferencia
 * estructural se resuelve internamente; el caller solo decide `mode`.
 *
 * `count` puede ser null (no aplica para esta entrada, e.g. "Inicio") o
 * número. El badge solo se pinta cuando count > 0; en collapsed además
 * solo aparece encima del icono como dot pequeño.
 *
 * `tone` se aplica al badge: 'default' = ink gris normal,
 * 'accent' = accent-primary (usado en Sugerencias para llamar la atención).
 */
export type NavItem = {
  value: ViewMode
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

export function NavButton({
  item,
  active,
  count,
  noticeCount = 0,
  mode,
  badgeTone = 'default',
  accentColor,
  onClick,
}: {
  item: NavItem
  active: boolean
  /** null = no count (oculta badge). number = mostrar (animado con NumberTicker). */
  count: number | null
  noticeCount?: number
  mode: 'expanded' | 'collapsed'
  badgeTone?: 'default' | 'accent'
  /** λ4: color de la barra lateral activa + del icono activo. Si se omite,
      cae a ink-700 (el comportamiento β3 original). El color sólo se ve
      cuando active=true; en estado no-activo el botón sigue siendo ink. */
  accentColor?: string
  onClick: () => void
}) {
  const Icon = item.icon
  // axe rule label-content-name-mismatch (γ4 + δ8): el aria-label DEBE
  // contener literalmente el texto visible. En expanded el visible es
  // "Entidades 63" (label + badge), en collapsed solo el icono. Para
  // ambos casos generamos un aria-label que matcheé el texto visible
  // sin agregar parens ni comas.
  const noticeLabel =
    noticeCount > 0
      ? `${noticeCount} ${noticeCount === 1 ? 'invitación' : 'invitaciones'}`
      : ''
  const countLabel = count !== null && count > 0 ? String(count) : ''
  const ariaLabel = [item.label, countLabel, noticeLabel].filter(Boolean).join(' ')
  const showCount = count !== null && count > 0
  const showNotice = noticeCount > 0

  if (mode === 'collapsed') {
    // Icono solo, con badge dot arriba a la derecha si hay count. La
    // pista de "qué es" la da el Tooltip. Mantenemos un side="bottom"
    // porque a la derecha está el contenido principal.
    return (
      <Tooltip content={item.label} side="bottom">
        <button
          onClick={onClick}
          aria-label={ariaLabel}
          aria-current={active ? 'page' : undefined}
          className={`touch-target relative p-2.5 rounded-lg transition-all duration-250 ease-out active:scale-95 ${
            active
              ? 'bg-ink-700/10 text-ink-700'
              : 'text-ink-300 hover:text-ink-700 hover:bg-ink-700/5'
          }`}
        >
          <Icon size={18} />
          {active && (
            <span
              aria-hidden
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-1 h-5 rounded-r"
              style={{ backgroundColor: accentColor ?? 'rgb(var(--ink-700))' }}
            />
          )}
          {showCount && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-ink-700 text-paper-50 text-micro font-medium flex items-center justify-center">
              <NumberTicker value={count!} />
            </span>
          )}
          {showNotice && !showCount && (
            <span
              aria-hidden
              className="absolute top-1 right-1 size-2 rounded-full"
              style={{ backgroundColor: 'var(--accent-gold)' }}
            />
          )}
        </button>
      </Tooltip>
    )
  }

  // mode === 'expanded'
  // Layout horizontal: icono + label + count (alineado a la derecha).
  // Active state: barra lateral 2px del lado izquierdo (β3 — Codex/Cursor),
  // en vez de bg-fill, que es ruidoso.
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={`touch-target group flex items-center justify-between gap-2 pl-3 pr-2.5 py-1.5 rounded-md text-body transition-colors relative ${
        active
          ? 'text-ink-800 font-medium'
          : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100/60'
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r"
          style={{ backgroundColor: accentColor ?? 'rgb(var(--ink-700))' }}
        />
      )}
      <span className="flex items-center gap-2.5 min-w-0">
        {/* λ4: cuando active + accentColor, el icono respira con el color de
            la sección. El label sigue ink-800 (legibilidad). Sin accentColor
            caemos al comportamiento β3 (gris uniforme).
            Wrapper span con currentColor para que el stroke del SVG hereda. */}
        <span
          className="inline-flex shrink-0"
          style={active && accentColor ? { color: accentColor } : undefined}
        >
          <Icon
            size={14}
            className={
              active && accentColor
                ? undefined
                : active
                  ? 'text-ink-700'
                  : 'text-ink-400 group-hover:text-ink-600'
            }
          />
        </span>
        <span className="truncate">{item.label}</span>
      </span>
      {showCount && (
        <span
          className={
            badgeTone === 'accent'
              ? 'text-caption px-1.5 py-px rounded font-medium'
              : 'text-caption text-ink-400 font-normal'
          }
          style={
            badgeTone === 'accent'
              ? {
                  backgroundColor: 'var(--accent-primary-soft)',
                  color: 'var(--accent-primary)',
                }
              : undefined
          }
        >
          <NumberTicker value={count!} />
        </span>
      )}
      {showNotice && (
        <span
          aria-hidden
          className="min-w-[18px] rounded-full px-1.5 py-px text-center text-micro font-medium text-paper-50"
          style={{ backgroundColor: 'var(--accent-gold)' }}
        >
          <NumberTicker value={noticeCount} />
        </span>
      )}
    </button>
  )
}
