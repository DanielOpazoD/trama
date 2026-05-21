import { ENTITY_TYPES, type Entity, type EntityType } from '../../types'

export const TYPE_ACCENT: Record<EntityType, string> = {
  persona:  '#8E5A2C',
  libro:    '#3D3528',
  cancion:  '#9A4F4B',
  album:    '#6D4A78',
  pelicula: '#4F6584',
  obra:     '#6B7440',
  concepto: '#8E6B33',
  idea:     '#9C5934',
}

const NODE_TRUNCATE = 24

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

/** Stable per-id pseudo-random in [0, 1) — same id always returns same value. */
function hashToUnit(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return (h % 10_000) / 10_000
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
  const radius = Math.min(9 + Math.sqrt(connectionCount) * 4.5, 28)
  const opacity = isDimmed ? 0.28 : 1
  const typeLabel = ENTITY_TYPES.find((t) => t.value === entity.type)?.label
  const labelY = radius + 14
  const typeLabelY = labelY + 10

  const ringStroke = isSelected ? 'var(--ink)' : isFocused ? 'var(--ink-2)' : accent
  const ringWidth = isSelected ? 2.2 : isFocused ? 2 : 1.4
  const ringOpacity = isSelected || isFocused ? 0.95 : 0.75
  const ringDash = isFocused && !isSelected ? '4 2' : undefined

  // Ambient drift: stable random phase per entity so the graph breathes
  // without all nodes moving in unison.
  const driftDelay = `${-(hashToUnit(entity.id) * 14)}s`

  return (
    <g
      id={`graph-node-${entity.id}`}
      role="button"
      aria-label={`${entity.name}, ${typeLabel}${
        connectionCount > 0 ? `, ${connectionCount} conexiones` : ''
      }${isSelected ? ', seleccionado' : ''}`}
      transform={`translate(${x} ${y})`}
      className={`graph-node ${isFresh ? 'animate-node-in' : ''}`}
      style={{
        cursor: 'grab',
        opacity,
        transition: 'opacity 200ms ease',
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {/* Inner group applies ambient drift; outer stays at the layout position
          so dragging and force-layout still work normally. */}
      <g
        className={isSelected ? undefined : 'animate-node-drift'}
        style={{ animationDelay: driftDelay }}
      >
        {/* Selection halo with gentle pulse */}
        {isSelected && (
          <circle
            cx={0}
            cy={0}
            r={radius + 4}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={6}
            className="animate-halo-pulse"
          />
        )}
        {/* Node body */}
        <circle
          cx={0}
          cy={0}
          r={radius}
          fill="var(--bg-card)"
          stroke={ringStroke}
          strokeOpacity={ringOpacity}
          strokeWidth={ringWidth}
          strokeDasharray={ringDash}
        />
        {/* Inner accent dot */}
        <circle cx={0} cy={0} r={Math.max(radius - 7, 2)} fill={accent} fillOpacity={0.14} />
        {/* AI provenance pip */}
        {entity.origin.kind === 'ai' && (
          <circle
            cx={radius * 0.7}
            cy={-radius * 0.7}
            r={2.5}
            fill="#7AA7C7"
            stroke="var(--bg-card)"
            strokeWidth={1.5}
          />
        )}
        {/* Name */}
        <text
          y={labelY}
          textAnchor="middle"
          fontSize={12}
          fontWeight={500}
          fill="var(--ink)"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {truncate(entity.name, NODE_TRUNCATE)}
        </text>
        {/* Type */}
        <text
          y={typeLabelY}
          textAnchor="middle"
          fontSize={8.5}
          fill="var(--ink-dim)"
          letterSpacing="1.4"
          style={{
            userSelect: 'none',
            pointerEvents: 'none',
            textTransform: 'uppercase',
          }}
        >
          {typeLabel}
        </text>
      </g>
    </g>
  )
}
