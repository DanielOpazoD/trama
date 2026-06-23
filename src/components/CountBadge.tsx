import type { CSSProperties } from 'react'

/**
 * Badge de conteo (notificaciones, filtros activos, ítems por día). Centraliza
 * el COMPORTAMIENTO que estaba repetido en cada call site:
 *   - no renderiza nada si el conteo es 0 o menos;
 *   - capa el número en `max` y muestra `max+` (evita pills de 3 dígitos);
 *   - por defecto es decorativo (aria-hidden), porque el contexto lo da el
 *     control padre; si se pasa `label`, se anuncia como role="status".
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
  label,
}: {
  count: number
  /** Tope mostrado; por encima se renderiza `${max}+`. */
  max?: number
  className?: string
  style?: CSSProperties
  /** Nombre accesible. Si se omite, el badge es decorativo (aria-hidden). */
  label?: string
}) {
  if (count <= 0) return null
  const display = count > max ? `${max}+` : String(count)
  const a11y = label ? { role: 'status', 'aria-label': label } : { 'aria-hidden': true }
  return (
    <span className={className} style={style} {...a11y}>
      {display}
    </span>
  )
}
