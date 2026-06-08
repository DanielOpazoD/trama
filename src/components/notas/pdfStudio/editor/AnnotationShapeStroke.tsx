import type { ShapeKind } from '../../../../lib/pdfStudio/model/model'

function arrowHeadPath(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  sw: number,
): string {
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const back = { x: -dx / len, y: -dy / len }
  const headLen = Math.min(len * 0.3, Math.max(8, sw * 5))
  const a = Math.PI / 7
  const rot = (v: { x: number; y: number }, t: number) => ({
    x: v.x * Math.cos(t) - v.y * Math.sin(t),
    y: v.x * Math.sin(t) + v.y * Math.cos(t),
  })
  const h1 = rot(back, a)
  const h2 = rot(back, -a)
  return (
    `M ${p1.x} ${p1.y} L ${p1.x + h1.x * headLen} ${p1.y + h1.y * headLen} ` +
    `M ${p1.x} ${p1.y} L ${p1.x + h2.x * headLen} ${p1.y + h2.y * headLen}`
  )
}

export function ShapeStroke({
  shape,
  p0,
  p1,
  color,
  sw,
  opacity,
  dashed = false,
}: {
  shape: ShapeKind
  p0: { x: number; y: number }
  p1: { x: number; y: number }
  color: string
  sw: number
  opacity: number
  /** Trazo punteado (ej.: marca X DESHABILITADA, para leerse como "apagada"). */
  dashed?: boolean
}) {
  const x = Math.min(p0.x, p1.x)
  const y = Math.min(p0.y, p1.y)
  const w = Math.abs(p1.x - p0.x)
  const h = Math.abs(p1.y - p0.y)
  const common = {
    stroke: color,
    strokeWidth: sw,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    opacity,
    ...(dashed ? { strokeDasharray: `${sw * 1.6} ${sw * 1.4}` } : null),
    style: { pointerEvents: 'none' as const },
  }
  if (shape === 'rect') return <rect x={x} y={y} width={w} height={h} {...common} />
  if (shape === 'oval')
    return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />
  if (shape === 'x')
    return (
      <>
        <line x1={x} y1={y} x2={x + w} y2={y + h} {...common} />
        <line x1={x + w} y1={y} x2={x} y2={y + h} {...common} />
      </>
    )
  return (
    <>
      <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} {...common} />
      {shape === 'arrow' && <path d={arrowHeadPath(p0, p1, sw)} {...common} />}
    </>
  )
}
