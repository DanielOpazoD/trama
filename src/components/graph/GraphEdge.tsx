import { RELATIONSHIP_TYPES, type Relationship } from '../../types'

type Point = { x: number; y: number }

/**
 * Compute a quadratic Bezier path between two points with a perpendicular
 * curvature. The control point sits off the midpoint, perpendicular to the
 * line, by `curvature * length`. Same-direction siblings between two nodes
 * naturally fan out instead of overlapping.
 */
function curvedPath(from: Point, to: Point, curvature = 0.18): {
  d: string
  midX: number
  midY: number
} {
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.sqrt(dx * dx + dy * dy) || 1
  // Perpendicular unit vector
  const nx = -dy / length
  const ny = dx / length
  const controlX = midX + nx * length * curvature
  const controlY = midY + ny * length * curvature
  return {
    d: `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`,
    midX: controlX,
    midY: controlY,
  }
}

/**
 * Shrink the endpoints so the line stops at the node circumference instead of
 * the center. Uses a fixed `nodePad` since true radius isn't known here.
 */
function trimEndpoints(from: Point, to: Point, fromPad = 12, toPad = 14): {
  from: Point
  to: Point
} {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.sqrt(dx * dx + dy * dy) || 1
  return {
    from: { x: from.x + (dx / length) * fromPad, y: from.y + (dy / length) * fromPad },
    to: { x: to.x - (dx / length) * toPad, y: to.y - (dy / length) * toPad },
  }
}

export function GraphEdge({
  rel,
  from,
  to,
  highlighted,
  dimmed,
  fresh = false,
}: {
  rel: Relationship
  from: Point | undefined
  to: Point | undefined
  highlighted: boolean
  dimmed: boolean
  fresh?: boolean
}) {
  if (!from || !to) return null
  const trimmed = trimEndpoints(from, to)
  const { d, midX, midY } = curvedPath(trimmed.from, trimmed.to)

  const isAi = rel.origin.kind === 'ai'
  const stroke = isAi ? '#7AA7C7' : 'var(--ink-2)'
  const opacity = dimmed ? 0.08 : highlighted ? 0.85 : 0.32
  const strokeWidth = highlighted ? 1.6 : 1.1
  const typeLabel =
    RELATIONSHIP_TYPES.find((t) => t.value === rel.type)?.label ?? rel.type
  const markerId = isAi ? 'edgeArrowAi' : 'edgeArrow'

  return (
    <g
      style={{ pointerEvents: 'none', ['--final-opacity' as never]: opacity }}
      className={fresh ? 'animate-edge-in' : undefined}
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity={opacity}
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
      />
      {highlighted && (
        <g>
          <rect
            x={midX - typeLabel.length * 3 - 6}
            y={midY - 7}
            width={typeLabel.length * 6 + 12}
            height={14}
            rx={7}
            ry={7}
            fill="var(--bg-card)"
            fillOpacity={0.92}
          />
          <text
            x={midX}
            y={midY + 3}
            fontSize={9.5}
            fill="var(--ink)"
            textAnchor="middle"
            style={{ userSelect: 'none', letterSpacing: '0.05em' }}
          >
            {typeLabel}
          </text>
        </g>
      )}
    </g>
  )
}
