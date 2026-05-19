import { ENTITY_TYPES, type Entity, type EntityType } from '../../types'

// Subtle per-type accent — soft, paper-friendly hues.
export const TYPE_ACCENT: Record<EntityType, string> = {
  persona:  '#9C6F3B',
  libro:    '#3D3528',
  cancion:  '#A04763',
  album:    '#7E54A8',
  pelicula: '#4F7AA8',
  obra:     '#5A8060',
  concepto: '#9C8233',
  idea:     '#B26B2E',
}

const NODE_WIDTH = 140
const NODE_HEIGHT = 44

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

export function GraphNode({
  entity,
  x,
  y,
  isSelected,
  isDimmed,
  connectionCount,
  onMouseDown,
  onClick,
}: {
  entity: Entity
  x: number
  y: number
  isSelected: boolean
  isDimmed: boolean
  connectionCount: number
  onMouseDown: (event: React.MouseEvent) => void
  onClick: (event: React.MouseEvent) => void
}) {
  const accent = TYPE_ACCENT[entity.type]
  const scale = Math.min(1 + connectionCount * 0.03, 1.2)
  const w = NODE_WIDTH * scale
  const h = NODE_HEIGHT * scale
  const opacity = isDimmed ? 0.25 : 1
  const typeLabel = ENTITY_TYPES.find((t) => t.value === entity.type)?.label

  return (
    <g
      transform={`translate(${x - w / 2} ${y - h / 2})`}
      style={{ cursor: 'pointer', opacity, transition: 'opacity 150ms' }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <rect
        width={w}
        height={h}
        rx={h / 2}
        ry={h / 2}
        fill="#FBF8F0"
        stroke={isSelected ? '#3A3429' : accent}
        strokeWidth={isSelected ? 2 : 1}
        strokeOpacity={isSelected ? 1 : 0.5}
      />
      <circle cx={14 * scale} cy={h / 2} r={3 * scale} fill={accent} />
      <text
        x={24 * scale}
        y={h / 2 - 2}
        fontSize={12 * scale}
        fill="#3D3528"
        dominantBaseline="middle"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {truncate(entity.name, 18)}
      </text>
      <text
        x={24 * scale}
        y={h / 2 + 10 * scale}
        fontSize={7 * scale}
        fill="#857C66"
        letterSpacing="1.5"
        dominantBaseline="middle"
        style={{ userSelect: 'none', pointerEvents: 'none', textTransform: 'uppercase' }}
      >
        {typeLabel?.toUpperCase()}
      </text>
    </g>
  )
}
