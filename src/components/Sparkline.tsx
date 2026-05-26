/**
 * Sparkline minimalista — SVG line + area chart pequeño para mostrar
 * series temporales inline sin necesidad de chart libraries pesadas.
 *
 * Diseño:
 *   - Línea fina (1.5px) con el color del accent que el caller decida
 *   - Area fill debajo con 0.12 opacity
 *   - Sin ejes, sin labels — solo la forma de la serie
 *   - Dot al final (último punto) para enfatizar "ahora"
 *   - Si todos los valores son 0, render flat line en muted (sin data)
 *
 * Pensado para data viz inline tipo Stripe Dashboard o Vercel Analytics
 * — el contexto importa más que la precisión exacta. Si quieres tooltips
 * con valores por punto, mejor un chart real (Recharts/Visx).
 */

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color = 'var(--accent-primary)',
  showLastDot = true,
  ariaLabel,
}: {
  data: number[]
  width?: number
  height?: number
  /** Color de la línea + area. CSS custom prop o hex. */
  color?: string
  showLastDot?: boolean
  ariaLabel?: string
}) {
  if (data.length === 0) return null
  const maxVal = Math.max(...data, 0.0001) // evitar div/0
  const minVal = 0 // empezamos en 0 siempre para no exagerar variaciones pequeñas
  const range = maxVal - minVal
  const stepX = data.length > 1 ? width / (data.length - 1) : 0
  const padY = 2 // margin top/bottom para que el dot no se corte

  const points = data.map((v, i) => {
    const x = i * stepX
    const y =
      range === 0
        ? height / 2
        : padY + (height - padY * 2) * (1 - (v - minVal) / range)
    return { x, y }
  })

  // Path para línea
  const linePath = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ')

  // Path para area (cierra hasta el bottom)
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`

  const allZero = data.every((v) => v === 0)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      role="img"
      aria-label={ariaLabel ?? 'Serie temporal'}
    >
      {allZero ? (
        // Flat line muted — sin data en el rango
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="rgb(var(--ink-200))"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ) : (
        <>
          <path d={areaPath} fill={color} fillOpacity={0.12} />
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {showLastDot && points.length > 0 && (
            <circle
              cx={points[points.length - 1]!.x}
              cy={points[points.length - 1]!.y}
              r={2.5}
              fill={color}
            />
          )}
        </>
      )}
    </svg>
  )
}
