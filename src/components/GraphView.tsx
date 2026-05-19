import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useTrama } from '../state'
import {
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  type Entity,
  type EntityType,
  type Relationship,
} from '../types'

// ---------- A small force-directed layout written by hand ----------
// Iterative Fruchterman-Reingold approximation. Pure JS, no dependencies.

type LayoutNode = {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  fixed?: boolean
}
type LayoutEdge = { from: string; to: string }

function runLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  iterations: number,
): void {
  const k = 140 // ideal edge length
  const repulsion = k * k
  const center = { x: 0, y: 0 }

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between every pair of nodes.
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      a.vx = 0
      a.vy = 0
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const distSq = dx * dx + dy * dy + 0.01
        const dist = Math.sqrt(distSq)
        const force = repulsion / distSq
        a.vx += (dx / dist) * force
        a.vy += (dy / dist) * force
      }
      // Gravity toward center, gentle.
      a.vx += (center.x - a.x) * 0.02
      a.vy += (center.y - a.y) * 0.02
    }

    // Attraction along edges.
    for (const edge of edges) {
      const a = nodes.find((n) => n.id === edge.from)
      const b = nodes.find((n) => n.id === edge.to)
      if (!a || !b) continue
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01
      const force = (dist * dist) / k
      const fx = (dx / dist) * force * 0.5
      const fy = (dy / dist) * force * 0.5
      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }

    // Apply with a cooling factor. Fixed nodes don't move.
    const temperature = Math.max(0.5, 8 * (1 - iter / iterations))
    for (const node of nodes) {
      if (node.fixed) continue
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy) + 0.01
      const limited = Math.min(speed, temperature)
      node.x += (node.vx / speed) * limited
      node.y += (node.vy / speed) * limited
    }
  }
}

// ---------- Per-type accent colors ----------
const TYPE_ACCENT: Record<EntityType, string> = {
  persona:  '#9C6F3B', // amber
  libro:    '#3D3528', // ink
  cancion:  '#A04763', // rose
  album:    '#7E54A8', // violet
  pelicula: '#4F7AA8', // blue
  obra:     '#5A8060', // green
  concepto: '#9C8233', // mustard
  idea:     '#B26B2E', // orange
}

const NODE_WIDTH = 140
const NODE_HEIGHT = 44

// ---------- The component ----------

export default function GraphView({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const { entities, relationships, updateEntityPosition } = useTrama()
  const svgRef = useRef<SVGSVGElement>(null)
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  const layoutKey = useMemo(
    () =>
      entities.length +
      ':' +
      entities.map((e) => e.id).join(',') +
      '|' +
      relationships.map((r) => r.id).join(','),
    [entities, relationships],
  )

  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(
    new Map(),
  )

  // Compute positions: prefer persisted (positionX/Y from entity) over cached over
  // freshly-laid-out. Only nodes that lack a known position go through force layout;
  // the persisted ones stay where the user (or a previous layout) put them.
  useEffect(() => {
    if (entities.length === 0) {
      setPositions(new Map())
      return
    }

    type SimNode = LayoutNode & { fixed: boolean }
    const simNodes: SimNode[] = entities.map((entity) => {
      // Priority: persisted position from DB → cached position from this session → random.
      if (entity.positionX !== undefined && entity.positionY !== undefined) {
        const x = entity.positionX
        const y = entity.positionY
        positionsRef.current.set(entity.id, { x, y })
        return { id: entity.id, x, y, vx: 0, vy: 0, fixed: true }
      }
      const cached = positionsRef.current.get(entity.id)
      if (cached) {
        return { id: entity.id, x: cached.x, y: cached.y, vx: 0, vy: 0, fixed: true }
      }
      return {
        id: entity.id,
        x: (Math.random() - 0.5) * 400,
        y: (Math.random() - 0.5) * 400,
        vx: 0,
        vy: 0,
        fixed: false,
      }
    })

    // If everything is already placed, skip the layout entirely.
    const anyFree = simNodes.some((n) => !n.fixed)
    if (anyFree) {
      const layoutEdges: LayoutEdge[] = relationships
        .filter((r) => r.fromId !== r.toId)
        .map((r) => ({ from: r.fromId, to: r.toId }))
      runLayout(simNodes, layoutEdges, 350)
    }

    const next = new Map<string, { x: number; y: number }>()
    for (const node of simNodes) {
      next.set(node.id, { x: node.x, y: node.y })
      positionsRef.current.set(node.id, { x: node.x, y: node.y })
    }
    setPositions(next)
  }, [layoutKey, entities, relationships])

  // Pan and zoom via viewBox transform.
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  )

  // Drag a node.
  const dragging = useRef<{ id: string; offsetX: number; offsetY: number } | null>(
    null,
  )

  function screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const localX = clientX - rect.left - rect.width / 2
    const localY = clientY - rect.top - rect.height / 2
    return { x: localX / zoom - pan.x, y: localY / zoom - pan.y }
  }

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      // Pan on background.
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
      }
      setIsPanning(true)
    },
    [pan],
  )

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (dragging.current) {
        const { x, y } = screenToWorld(event.clientX, event.clientY)
        const id = dragging.current.id
        const newX = x - dragging.current.offsetX
        const newY = y - dragging.current.offsetY
        setPositions((prev) => {
          const next = new Map(prev)
          next.set(id, { x: newX, y: newY })
          positionsRef.current.set(id, { x: newX, y: newY })
          return next
        })
      } else if (panStart.current) {
        const dx = event.clientX - panStart.current.x
        const dy = event.clientY - panStart.current.y
        setPan({
          x: panStart.current.panX + dx / zoom,
          y: panStart.current.panY + dy / zoom,
        })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoom],
  )

  const handleMouseUp = useCallback(() => {
    // If we just finished dragging a node, persist its final position.
    if (dragging.current) {
      const id = dragging.current.id
      const pos = positionsRef.current.get(id)
      if (pos) updateEntityPosition(id, pos.x, pos.y)
    }
    dragging.current = null
    panStart.current = null
    setIsPanning(false)
  }, [updateEntityPosition])

  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault()
    const delta = event.deltaY > 0 ? 0.92 : 1.08
    setZoom((z) => Math.max(0.25, Math.min(2.5, z * delta)))
  }, [])

  const handleNodeMouseDown = useCallback(
    (event: React.MouseEvent, entity: Entity) => {
      event.stopPropagation()
      const world = screenToWorld(event.clientX, event.clientY)
      const pos = positionsRef.current.get(entity.id) ?? { x: 0, y: 0 }
      dragging.current = {
        id: entity.id,
        offsetX: world.x - pos.x,
        offsetY: world.y - pos.y,
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zoom, pan],
  )

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, entity: Entity) => {
      event.stopPropagation()
      // Only treat as click if we didn't drag meaningfully.
      onSelect(entity.id === selectedId ? null : entity.id)
    },
    [onSelect, selectedId],
  )

  const handleBackgroundClick = useCallback(() => {
    if (!dragging.current) onSelect(null)
  }, [onSelect])

  // Center the graph on first render.
  useEffect(() => {
    if (positions.size > 0 && pan.x === 0 && pan.y === 0) {
      // already centered around 0,0
    }
  }, [positions, pan])

  const connectionCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const rel of relationships) {
      map.set(rel.fromId, (map.get(rel.fromId) ?? 0) + 1)
      map.set(rel.toId, (map.get(rel.toId) ?? 0) + 1)
    }
    return map
  }, [relationships])

  if (entities.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-8 text-center">
        <div className="max-w-md">
          <p className="font-serif text-2xl text-ink-400 italic mb-3">
            Trama está vacía.
          </p>
          <p className="text-ink-400 text-sm leading-relaxed">
            Pega un texto en la barra de abajo — una nota, una cita, un párrafo
            desordenado — y la IA propondrá los primeros nodos. O añade entidades a
            mano desde las pestañas de la izquierda.
          </p>
        </div>
      </div>
    )
  }

  const cursorStyle: CSSProperties = {
    cursor: isPanning ? 'grabbing' : 'grab',
  }

  return (
    <svg
      ref={svgRef}
      className="w-full h-full"
      style={cursorStyle}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleBackgroundClick}
      onWheel={handleWheel}
    >
      <defs>
        <pattern id="paperDots" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="0.7" fill="#BFAE87" opacity="0.45" />
        </pattern>
        <marker
          id="edgeArrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5A4E3A" opacity="0.5" />
        </marker>
        <marker
          id="edgeArrowAi"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#7AA7C7" opacity="0.6" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="url(#paperDots)" />
      <g
        transform={`translate(50% 50%) scale(${zoom}) translate(${pan.x} ${pan.y})`}
        style={{ transformOrigin: 'center' }}
      >
        {/* Edges first, behind nodes */}
        {relationships.map((rel) => (
          <EdgeLine
            key={rel.id}
            rel={rel}
            from={positions.get(rel.fromId)}
            to={positions.get(rel.toId)}
            highlighted={
              selectedId === rel.fromId || selectedId === rel.toId
            }
            dimmed={
              selectedId !== null &&
              selectedId !== rel.fromId &&
              selectedId !== rel.toId
            }
          />
        ))}
        {/* Nodes */}
        {entities.map((entity) => {
          const pos = positions.get(entity.id)
          if (!pos) return null
          const isSelected = entity.id === selectedId
          const isDimmed =
            selectedId !== null &&
            !isSelected &&
            !relationships.some(
              (r) =>
                (r.fromId === selectedId && r.toId === entity.id) ||
                (r.toId === selectedId && r.fromId === entity.id),
            )
          return (
            <NodeGroup
              key={entity.id}
              entity={entity}
              x={pos.x}
              y={pos.y}
              isSelected={isSelected}
              isDimmed={isDimmed}
              connectionCount={connectionCount.get(entity.id) ?? 0}
              onMouseDown={(event) => handleNodeMouseDown(event, entity)}
              onClick={(event) => handleNodeClick(event, entity)}
            />
          )
        })}
      </g>

      {/* Zoom indicator */}
      <g transform="translate(20 20)">
        <text
          fontSize={10}
          fontFamily="inherit"
          fill="#857C66"
          style={{ userSelect: 'none' }}
        >
          {Math.round(zoom * 100)}%
        </text>
      </g>
    </svg>
  )
}

function EdgeLine({
  rel,
  from,
  to,
  highlighted,
  dimmed,
}: {
  rel: Relationship
  from: { x: number; y: number } | undefined
  to: { x: number; y: number } | undefined
  highlighted: boolean
  dimmed: boolean
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
    <g style={{ pointerEvents: 'none' }}>
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

function NodeGroup({
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
        filter={isSelected ? undefined : 'url(#nodeShadow)'}
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
