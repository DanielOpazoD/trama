import type { CSSProperties, ReactNode } from 'react'

/**
 * Chip de filtro COMPARTIDO por las barras del mundo Trama (Entidades y
 * Citas). Antes cada barra repetía las mismas clases inline (`px-2.5 py-1
 * rounded-full text-xs …`) y el mismo cálculo de color activo — se desincronizaban
 * con facilidad. Una sola pieza: el estilo activo (fondo lavado + texto en el
 * acento) llega por `activeStyle`, y la transición del fondo hace que activar
 * un filtro se sienta suave en vez de un salto seco.
 */
export function FilterChip({
  active,
  onClick,
  label,
  count,
  activeStyle,
  icon,
  ariaPressed,
  title,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  /** Estilo del estado activo (fondo lavado + color de acento). */
  activeStyle?: CSSProperties
  icon?: ReactNode
  ariaPressed?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed}
      title={title}
      style={active ? activeStyle : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption transition-colors ${
        active ? 'font-medium' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
      }`}
    >
      {icon}
      {label}
      {count != null && (
        <span className="ml-0.5 text-micro tabular-nums opacity-70">{count}</span>
      )}
    </button>
  )
}
