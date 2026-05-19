import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useTrama } from '../state'
import type { Entity } from '../types'
import { useForceLayout } from '../hooks/useForceLayout'
import { usePanZoom } from '../hooks/usePanZoom'
import { GraphNode } from './graph/GraphNode'
import { GraphEdge } from './graph/GraphEdge'

export default function GraphView({
  selectedId,
  onSelect,
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const { entities, relationships, updateEntityPosition } = useTrama()
  const svgRef = useRef<SVGSVGElement>(null)

  const { positions, setPosition } = useForceLayout({
    nodes: entities,
    edges: relationships,
  })

  const pz = usePanZoom(svgRef)

  const connectionCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const rel of relationships) {
      map.set(rel.fromId, (map.get(rel.fromId) ?? 0) + 1)
      map.set(rel.toId, (map.get(rel.toId) ?? 0) + 1)
    }
    return map
  }, [relationships])

  // Keyboard focus index — for accessibility. Distinct from selectedId so that
  // sighted users with a mouse keep current behavior, but keyboard users can
  // navigate without committing a selection.
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  // Reset focus when entity list changes (e.g., after import).
  useEffect(() => {
    if (focusedIndex >= entities.length) setFocusedIndex(-1)
  }, [entities.length, focusedIndex])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (entities.length === 0) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'Tab') {
        if (event.key === 'Tab' && event.shiftKey) {
          // Let shift+tab do default (leave the graph).
          return
        }
        event.preventDefault()
        setFocusedIndex((prev) => (prev + 1) % entities.length)
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        setFocusedIndex((prev) => (prev <= 0 ? entities.length - 1 : prev - 1))
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < entities.length) {
          const id = entities[focusedIndex].id
          onSelect(id === selectedId ? null : id)
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onSelect(null)
        setFocusedIndex(-1)
      }
    },
    [entities, focusedIndex, onSelect, selectedId],
  )

  const handleNodeMouseDown = useCallback(
    (event: React.MouseEvent, entity: Entity) => {
      event.stopPropagation()
      const world = pz.screenToWorld(event.clientX, event.clientY)
      const pos = positions.get(entity.id) ?? { x: 0, y: 0 }
      pz.startDrag(entity.id, { x: world.x - pos.x, y: world.y - pos.y })
    },
    [pz, positions],
  )

  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      const draggingId = pz.draggingId()
      if (draggingId) {
        const world = pz.screenToWorld(event.clientX, event.clientY)
        const pos = positions.get(draggingId)
        if (!pos) return
        setPosition(draggingId, world.x, world.y)
      } else {
        pz.onMouseMove(event)
      }
    },
    [pz, positions, setPosition],
  )

  const handleMouseUp = useCallback(() => {
    const id = pz.draggingId()
    if (id) {
      const pos = positions.get(id)
      if (pos) updateEntityPosition(id, pos.x, pos.y)
    }
    pz.cancelDrag()
    pz.onMouseUp()
  }, [pz, positions, updateEntityPosition])

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, entity: Entity, index: number) => {
      event.stopPropagation()
      setFocusedIndex(index)
      onSelect(entity.id === selectedId ? null : entity.id)
    },
    [onSelect, selectedId],
  )

  const handleBackgroundClick = useCallback(() => {
    if (!pz.isDragging()) onSelect(null)
  }, [pz, onSelect])

  if (entities.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-8 text-center" role="status">
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

  const cursorStyle: CSSProperties = { cursor: pz.isPanning ? 'grabbing' : 'grab' }
  const focusedEntity = focusedIndex >= 0 ? entities[focusedIndex] : null

  return (
    <svg
      ref={svgRef}
      className="w-full h-full focus:outline-none"
      style={cursorStyle}
      tabIndex={0}
      role="application"
      aria-label={`Grafo de afinidades. ${entities.length} entidades, ${relationships.length} relaciones. Usa las flechas para navegar, Enter para seleccionar, Escape para deseleccionar.`}
      aria-activedescendant={focusedEntity ? `graph-node-${focusedEntity.id}` : undefined}
      onMouseDown={pz.onMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleBackgroundClick}
      onWheel={pz.onWheel}
      onKeyDown={handleKeyDown}
    >
      <defs>
        <pattern id="paperDots" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="0.7" fill="#BFAE87" opacity="0.45" />
        </pattern>
        <marker id="edgeArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5A4E3A" opacity="0.5" />
        </marker>
        <marker id="edgeArrowAi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#7AA7C7" opacity="0.6" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="url(#paperDots)" />
      <g
        transform={`translate(50% 50%) scale(${pz.zoom}) translate(${pz.pan.x} ${pz.pan.y})`}
        style={{ transformOrigin: 'center' }}
      >
        {relationships.map((rel) => (
          <GraphEdge
            key={rel.id}
            rel={rel}
            from={positions.get(rel.fromId)}
            to={positions.get(rel.toId)}
            highlighted={selectedId === rel.fromId || selectedId === rel.toId}
            dimmed={
              selectedId !== null &&
              selectedId !== rel.fromId &&
              selectedId !== rel.toId
            }
          />
        ))}
        {entities.map((entity, index) => {
          const pos = positions.get(entity.id)
          if (!pos) return null
          const isSelected = entity.id === selectedId
          const isFocused = index === focusedIndex
          const isDimmed =
            selectedId !== null &&
            !isSelected &&
            !relationships.some(
              (r) =>
                (r.fromId === selectedId && r.toId === entity.id) ||
                (r.toId === selectedId && r.fromId === entity.id),
            )
          return (
            <GraphNode
              key={entity.id}
              entity={entity}
              x={pos.x}
              y={pos.y}
              isSelected={isSelected}
              isFocused={isFocused}
              isDimmed={isDimmed}
              connectionCount={connectionCount.get(entity.id) ?? 0}
              onMouseDown={(event) => handleNodeMouseDown(event, entity)}
              onClick={(event) => handleNodeClick(event, entity, index)}
            />
          )
        })}
      </g>

      <g transform="translate(20 20)">
        <text fontSize={10} fontFamily="inherit" fill="#857C66" style={{ userSelect: 'none' }}>
          {Math.round(pz.zoom * 100)}%
        </text>
      </g>
    </svg>
  )
}
