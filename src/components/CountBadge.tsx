import type { CSSProperties } from 'react'

/**
 * Badge de conteo (notificaciones, filtros activos, ítems por día). Centraliza
 * el COMPORTAMIENTO que estaba repetido en cada call site:
 *   - no renderiza nada si el conteo es 0 o menos;
 *   - capa el número en `max` y muestra `max+` (evita pills de 3 dígitos).
 *
 * Es DECORATIVO (aria-hidden) a propósito: el badge se monta sobre un control
 * (botón/nav/celda) cuyo nombre accesible YA debe incluir el conteo, p. ej.
 * `aria-label={`Notificaciones, ${n} sin leer`}`. Anunciarlo también desde el
 * badge (role=status) duplicaría el dato y, dentro de un botón, le robaría el
 * nombre. Si en el futuro hiciera falta un contador autónomo y anunciable, ese
 * es otro componente.
 *
 * El LOOK queda en manos del call site vía `className`/`style` (posición,
 * tamaño, color de fondo): así cada badge conserva su aspecto exacto y este
 * primitivo no impone una estética única.
 */
export function CountBadge({
  count,
  max = 99,
  className,
  style,
}: {
  count: number
  /** Tope mostrado; por encima se renderiza `${max}+`. */
  max?: number
  className?: string
  style?: CSSProperties
}) {
  if (count <= 0) return null
  const display = count > max ? `${max}+` : String(count)
  return (
    <span className={className} style={style} aria-hidden>
      {display}
    </span>
  )
}
