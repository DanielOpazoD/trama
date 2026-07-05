import { useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import type { Entity, Relationship } from '../../types'
import type { LayoutMode } from '../../hooks/layouts/types'
import { GraphNode } from './GraphNode'
import { GraphEdge } from './GraphEdge'
import { HoverPreviewCard } from './HoverPreviewCard'

/**
 * Render SVG del grafo. Componente "dumb": recibe TODO calculado (positions,
 * cluster centroids, dataset, freshness, etc.) y solo dibuja.
 *
 * Vive separado de `GraphView` para que esa quede como contenedor de
 * estado + integración con queries/mutations, y el render del canvas
 * sea legible (defs, cluster labels, edges, nodes, hover card en orden).
 *
 * El switch a WebGL (sigma) se decide en GraphView — este componente
 * solo se usa en modo SVG.
 */
export type GraphSvgCanvasProps = {
  svgRef: React.Ref<SVGSVGElement>
  svgSize: { width: number; height: number }
  cursorStyle: CSSProperties
  pan: { x: number; y: number }
  zoom: number
  /** Modo de layout actual — afecta el estilo de las edges (organic vs
   *  geométricos) y si se pintan los cluster centroids (solo by-type). */
  mode: LayoutMode
  entities: Entity[]
  relationships: Relationship[]
  positions: Map<string, { x: number; y: number }>
  selectedId: string | null
  focusedIndex: number
  freshEntities: Set<string>
  freshRels: Set<string>
  connectionCount: Map<string, number>
  /** En modo by-type, centroides por tipo para pintar labels gigantes
   *  detrás. En otros modos, `null`. */
  clusterCentroids: Array<{
    type: string
    label: string
    cx: number
    cy: number
    count: number
  }> | null
  hoveredEntityId: string | null
  /** ω-leyenda: tipo resaltado desde la leyenda. Cuando no hay selección,
   *  los nodos de otro tipo se atenúan y los de este se encienden. */
  hoveredType: string | null
  // Handlers globales del SVG (pan/zoom, deselect en background).
  onSvgMouseDown: (event: ReactMouseEvent) => void
  onSvgMouseMove: (event: ReactMouseEvent) => void
  onSvgMouseUp: () => void
  onSvgWheel: (event: React.WheelEvent) => void
  onBackgroundClick: () => void
  onKeyDown: (event: React.KeyboardEvent) => void
  // Handlers por nodo.
  onNodeMouseDown: (event: ReactMouseEvent, entity: Entity) => void
  onNodeClick: (event: ReactMouseEvent, entity: Entity, index: number) => void
  onNodeHoverStart: (id: string) => void
  onNodeHoverEnd: () => void
}

export function GraphSvgCanvas({
  svgRef,
  svgSize,
  cursorStyle,
  pan,
  zoom,
  mode,
  entities,
  relationships,
  positions,
  selectedId,
  focusedIndex,
  freshEntities,
  freshRels,
  connectionCount,
  clusterCentroids,
  hoveredEntityId,
  hoveredType,
  onSvgMouseDown,
  onSvgMouseMove,
  onSvgMouseUp,
  onSvgWheel,
  onBackgroundClick,
  onKeyDown,
  onNodeMouseDown,
  onNodeClick,
  onNodeHoverStart,
  onNodeHoverEnd,
}: GraphSvgCanvasProps) {
  const focusedEntity = focusedIndex >= 0 ? entities[focusedIndex] : null
  const selectedNeighborIds = useMemo(() => {
    if (!selectedId) return null
    const ids = new Set<string>()
    for (const rel of relationships) {
      if (rel.fromId === selectedId) ids.add(rel.toId)
      if (rel.toId === selectedId) ids.add(rel.fromId)
    }
    return ids
  }, [relationships, selectedId])

  return (
    <svg
      ref={svgRef}
      className="w-full h-full"
      style={cursorStyle}
      tabIndex={0}
      role="application"
      aria-label={`Grafo de afinidades. ${entities.length} entidades, ${relationships.length} relaciones. Modo ${mode}. Usa las flechas para navegar, Enter para seleccionar, Escape para deseleccionar.`}
      aria-activedescendant={focusedEntity ? `graph-node-${focusedEntity.id}` : undefined}
      onMouseDown={onSvgMouseDown}
      onMouseMove={onSvgMouseMove}
      onMouseUp={onSvgMouseUp}
      onMouseLeave={onSvgMouseUp}
      onClick={onBackgroundClick}
      onWheel={onSvgWheel}
      onKeyDown={onKeyDown}
    >
      <defs>
        <pattern id="paperDots" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="14" cy="14" r="0.7" fill="var(--dot)" opacity="0.55" />
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
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink-2)" opacity="0.5" />
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
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--origin-ai)" opacity="0.6" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="url(#paperDots)" />
      <g
        transform={`translate(${svgSize.width / 2} ${svgSize.height / 2}) scale(${zoom}) translate(${pan.x} ${pan.y})`}
      >
        {/* ζ6: cluster annotations. Labels gigantes traslúcidos en serif
            italic atrás de cada grupo en modo by-type. El grafo se
            autocomenta: "estos son tus libros", "estos tus filósofos".
            Renderizado ANTES de los edges para que quede debajo. */}
        {clusterCentroids &&
          clusterCentroids.map(({ type, label, cx, cy }) => (
            <text
              key={`cluster-${type}`}
              x={cx}
              y={cy}
              textAnchor="middle"
              fontSize={64}
              fontFamily="Spectral, Iowan Old Style, Palatino, Georgia, serif"
              fontStyle="italic"
              fontWeight={300}
              fill="var(--ink)"
              fillOpacity={0.06}
              style={{
                userSelect: 'none',
                pointerEvents: 'none',
                textTransform: 'lowercase',
              }}
            >
              {label}
            </text>
          ))}
        {relationships.map((rel) => (
          <GraphEdge
            key={rel.id}
            rel={rel}
            from={positions.get(rel.fromId)}
            to={positions.get(rel.toId)}
            highlighted={selectedId === rel.fromId || selectedId === rel.toId}
            dimmed={
              selectedId !== null && selectedId !== rel.fromId && selectedId !== rel.toId
            }
            fresh={freshRels.has(rel.id)}
            layoutMode={mode}
          />
        ))}
        {entities.map((entity, index) => {
          const pos = positions.get(entity.id)
          if (!pos) return null
          const isSelected = entity.id === selectedId
          const isFocused = index === focusedIndex
          // La linterna de selección manda; sin selección, el hover de un
          // tipo en la leyenda enciende sus nodos y atenúa el resto.
          const isDimmed =
            selectedId !== null
              ? !isSelected && !selectedNeighborIds?.has(entity.id)
              : hoveredType !== null && entity.type !== hoveredType
          return (
            <GraphNode
              key={entity.id}
              entity={entity}
              x={pos.x}
              y={pos.y}
              isSelected={isSelected}
              isFocused={isFocused}
              isDimmed={isDimmed}
              isFresh={freshEntities.has(entity.id)}
              connectionCount={connectionCount.get(entity.id) ?? 0}
              onMouseDown={(event) => onNodeMouseDown(event, entity)}
              onClick={(event) => onNodeClick(event, entity, index)}
              onHoverStart={() => onNodeHoverStart(entity.id)}
              onHoverEnd={onNodeHoverEnd}
            />
          )
        })}
        {/* ζ5: hover preview card — al final del grupo así queda encima
            de todos los nodos. Solo render si hay hover Y la entidad
            existe en positions. */}
        {hoveredEntityId &&
          (() => {
            const ent = entities.find((e) => e.id === hoveredEntityId)
            const pos = positions.get(hoveredEntityId)
            if (!ent || !pos) return null
            return (
              <HoverPreviewCard
                entity={ent}
                posX={pos.x}
                posY={pos.y}
                connectionCount={connectionCount.get(ent.id) ?? 0}
              />
            )
          })()}
      </g>
    </svg>
  )
}
