import { ENTITY_TYPES, type Entity, type EntityType } from '../../types'

/**
 * Restrained earth-tone palette. Distinguishable but cohesive — every accent
 * reads as a variation of ink on paper, not as rainbow chips.
 */
export const TYPE_ACCENT: Record<EntityType, string> = {
  persona:  '#8E5A2C', // warm umber
  libro:    '#3D3528', // deep ink
  cancion:  '#9A4F4B', // muted terracotta
  album:    '#6D4A78', // dusty plum
  pelicula: '#4F6584', // muted slate
  obra:     '#6B7440', // olive
  concepto: '#8E6B33', // muted gold
  idea:     '#9C5934', // rust
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

/**
 * Node rendering as a circle with the entity name set below it.
 * Size scales with the connection count (square-root scale, capped).
 * Hover/selection/focus expressed as ring stroke variations + opacity.
 */
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
  // Radius scales by square-root of connections — visible difference between
  // a leaf node and a hub, without hubs dominating the view.
  const radius = Math.min(9 + Math.sqrt(connectionCount) * 4.5, 28)
  const opacity = isDimmed ? 0.28 : 1
  const typeLabel = ENTITY_TYPES.find((t) => t.value === entity.type)?.label
  const labelY = radius + 14
  const typeLabelY = labelY + 10

  const ringStroke = isSelected ? 'var(--ink)' : isFocused ? 'var(--ink-2)' : accent
  const ringWidth = isSelected ? 2.2 : isFocused ? 2 : 1.4
  const ringOpacity = isSelected || isFocused ? 0.95 : 0.75
  const ringDash = isFocused && !isSelected ? '4 2' : undefined

  return (
    <g
      id={`graph-node-${entity.id}`}
      role="button"
      aria-label={`${entity.name}, ${typeLabel}${
        connectionCount > 0 ? `, ${connectionCount} conexiones` : ''
      }${isSelected ? ', seleccionado' : ''}`}
      transform={`translate(${x} ${y})`}
      className={isFresh ? 'animate-node-in' : undefined}
      style={{
        cursor: 'pointer',
        opacity,
        transition: 'opacity 200ms ease',
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {/* Selection halo (drawn behind the node) */}
      {isSelected && (
        <circle
          cx={0}
          cy={0}
          r={radius + 4}
          fill="none"
          stroke="var(--ink)"
          strokeOpacity={0.15}
          strokeWidth={6}
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
      {/* Inner accent dot — subtle color reveal */}
      <circle cx={0} cy={0} r={Math.max(radius - 7, 2)} fill={accent} fillOpacity={0.12} />
      {/* Origin indicator: tiny ai pip on the upper-right when AI-added */}
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
      {/* Name label below the node */}
      <text
        y={labelY}
        textAnchor="middle"
        fontSize={12}
        fontWeight={500}
        fill="var(--ink)"
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {truncate(entity.name, 24)}
      </text>
      {/* Type label, dimmer, beneath the name */}
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
  )
}
