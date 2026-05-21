import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  useEntitiesQuery,
  useOffline,
  useRelationshipsQuery,
  useSuggestRelationships,
  useUpdateEntityPosition,
} from '../state'
import type { Entity, ExtractionProposal } from '../types'
import { useGraphLayout } from '../hooks/useGraphLayout'
import { usePanZoom } from '../hooks/usePanZoom'
import { useFreshIds } from '../hooks/useFreshIds'
import { GraphNode } from './graph/GraphNode'
import { GraphEdge } from './graph/GraphEdge'
import { GraphToolbar } from './graph/GraphToolbar'
import { EmptyState } from './EmptyState'
import type { LayoutMode } from '../hooks/layouts/types'

export default function GraphView({
  selectedId,
  onSelect,
  onProposal,
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
  onProposal?: (text: string, proposal: ExtractionProposal) => void
}) {
  const { data: entities = [] } = useEntitiesQuery()
  const { data: relationships = [] } = useRelationshipsQuery()
  const updateEntityPosition = useUpdateEntityPosition()
  const suggest = useSuggestRelationships()
  const { offline } = useOffline()
  const svgRef = useRef<SVGSVGElement>(null)
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 })
  const [mode, setMode] = useState<LayoutMode>('organic')
  const [suggestEmpty, setSuggestEmpty] = useState(false)

  // Measure the SVG so we can center the world group using numeric translate.
  // (SVG transform attribute does not accept percentage values.)
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const update = () => {
      const rect = svg.getBoundingClientRect()
      setSvgSize({ width: rect.width, height: rect.height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  const { positions, setPosition, reorganize } = useGraphLayout({
    mode,
    nodes: entities,
    edges: relationships,
  })

  const pz = usePanZoom(svgRef)

  const freshEntities = useFreshIds(entities.map((e) => e.id))
  const freshRels = useFreshIds(relationships.map((r) => r.id))

  const connectionCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const rel of relationships) {
      map.set(rel.fromId, (map.get(rel.fromId) ?? 0) + 1)
      map.set(rel.toId, (map.get(rel.toId) ?? 0) + 1)
    }
    return map
  }, [relationships])

  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  useEffect(() => {
    if (focusedIndex >= entities.length) setFocusedIndex(-1)
  }, [entities.length, focusedIndex])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (entities.length === 0) return
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'Tab') {
        if (event.key === 'Tab' && event.shiftKey) return
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
      // Only persist drag positions when we're in organic mode — other modes
      // recompute deterministically, so persistence would be misleading.
      if (pos && mode === 'organic') updateEntityPosition(id, pos.x, pos.y)
    }
    pz.cancelDrag()
    pz.onMouseUp()
  }, [pz, positions, updateEntityPosition, mode])

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

  const handleSuggest = useCallback(async () => {
    setSuggestEmpty(false)
    try {
      const proposal = await suggest.mutateAsync()
      if (proposal.relationships.length === 0) {
        setSuggestEmpty(true)
        return
      }
      onProposal?.('Sugerencias entre entidades existentes', proposal)
    } catch {
      // surfaces via suggest.error
    }
  }, [suggest, onProposal])

  if (entities.length === 0) {
    return <EmptyState />
  }

  const cursorStyle: CSSProperties = { cursor: pz.isPanning ? 'grabbing' : 'grab' }
  const focusedEntity = focusedIndex >= 0 ? entities[focusedIndex] : null

  return (
    <div className="relative h-full w-full">
      <GraphToolbar
        mode={mode}
        onModeChange={setMode}
        onReorganize={reorganize}
        onSuggest={handleSuggest}
        suggestPending={suggest.isPending}
        suggestDisabled={offline || entities.length < 2}
        zoomPercent={Math.round(pz.zoom * 100)}
        entityCount={entities.length}
        relationshipCount={relationships.length}
      />

      {(suggest.error || suggestEmpty) && (
        <div className="pointer-events-none absolute top-16 inset-x-0 z-10 flex justify-center px-3">
          <div
            className={
              suggest.error
                ? 'pointer-events-auto px-4 py-2 bg-red-50/95 border border-red-200/70 rounded-xl text-sm text-red-800 shadow-md max-w-md'
                : 'pointer-events-auto px-4 py-2 bg-paper-50/95 border border-ink-100/70 rounded-xl text-sm text-ink-500 shadow-md max-w-md leading-relaxed'
            }
          >
            {suggest.error
              ? suggest.error.message
              : 'La IA no encontró relaciones nuevas obvias. Prueba añadiendo descripciones o citas a las entidades para darle más contexto.'}
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        className="w-full h-full focus:outline-none"
        style={cursorStyle}
        tabIndex={0}
        role="application"
        aria-label={`Grafo de afinidades. ${entities.length} entidades, ${relationships.length} relaciones. Modo ${mode}. Usa las flechas para navegar, Enter para seleccionar, Escape para deseleccionar.`}
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
            <circle cx="14" cy="14" r="0.7" fill="var(--dot)" opacity="0.55" />
          </pattern>
          <marker id="edgeArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink-2)" opacity="0.5" />
          </marker>
          <marker id="edgeArrowAi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#7AA7C7" opacity="0.6" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#paperDots)" />
        <g
          transform={`translate(${svgSize.width / 2} ${svgSize.height / 2}) scale(${pz.zoom}) translate(${pz.pan.x} ${pz.pan.y})`}
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
              fresh={freshRels.has(rel.id)}
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
                isFresh={freshEntities.has(entity.id)}
                connectionCount={connectionCount.get(entity.id) ?? 0}
                onMouseDown={(event) => handleNodeMouseDown(event, entity)}
                onClick={(event) => handleNodeClick(event, entity, index)}
              />
            )
          })}
        </g>
      </svg>
    </div>
  )
}
