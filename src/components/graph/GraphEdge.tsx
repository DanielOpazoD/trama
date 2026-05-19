import { RELATIONSHIP_TYPES, type Relationship } from '../../types'

export function GraphEdge({
  rel,
  from,
  to,
  highlighted,
  dimmed,
  fresh = false,
}: {
  rel: Relationship
  from: { x: number; y: number } | undefined
  to: { x: number; y: number } | undefined
  highlighted: boolean
  dimmed: boolean
  fresh?: boolean
}) {
  if (!from || !to) return null
  const stroke = rel.origin.kind === 'ai' ? '#7AA7C7' : '#5A4E3A'
  const opacity = dimmed ? 0.1 : highlighted ? 0.85 : 0.4
  const strokeWidth = highlighted ? 1.5 : 1
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const typeLabel =
    RELATIONSHIP_TYPES.find((t) => t.value === rel.type)?.label ?? rel.type
  const markerId = rel.origin.kind === 'ai' ? 'edgeArrowAi' : 'edgeArrow'

  return (
    <g
      style={{ pointerEvents: 'none', ['--final-opacity' as never]: opacity }}
      className={fresh ? 'animate-edge-in' : undefined}
    >
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity={opacity}
        markerEnd={`url(#${markerId})`}
      />
      {highlighted && (
        <text
          x={midX}
          y={midY}
          fontSize={9}
          fill="#5A4E3A"
          textAnchor="middle"
          dy={-4}
          style={{ userSelect: 'none' }}
        >
          {typeLabel}
        </text>
      )}
    </g>
  )
}
