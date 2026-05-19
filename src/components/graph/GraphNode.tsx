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
  isFocused = false,
  isDimmed,
  isFresh = false,
  connectionCount,
  onMouseDown,
  onClick,
}: {
  entity: Entity
  x: number
  y: number
  isSelected: boolean
  isFocused?: boolean
  isDimmed: boolean
  isFresh?: boolean
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

  // Border: focused shows a keyboard focus ring; selected darkens; otherwise type accent.
  const strokeColor = isSelected ? '#3A3429' : isFocused ? '#5A4E3A' : accent
  const strokeWidth = isSelected || isFocused ? 2 : 1
  const strokeDasharray = isFocused && !isSelected ? '4 2' : undefined

  return (
    <g
      id={`graph-node-${entity.id}`}
      role="button"
      aria-label={`${entity.name}, ${typeLabel}${
        connectionCount > 0 ? `, ${connectionCount} conexiones` : ''
      }${isSelected ? ', seleccionado' : ''}`}
      transform={`translate(${x - w / 2} ${y - h / 2})`}
      className={isFresh ? 'animate-node-in' : undefined}
      style={{
        cursor: 'pointer',
        opacity,
        transition: 'opacity 200ms ease',
        transformOrigin: `${w / 2}px ${h / 2}px`,
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <rect
        width={w}
        height={h}
        rx={h / 2}
        ry={h / 2}
        fill="#FBF8F0"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={isSelected || isFocused ? 1 : 0.5}
        strokeDasharray={strokeDasharray}
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
