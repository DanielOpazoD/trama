import {
  Suspense,
  lazy,
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
  useNeighborsQuery,
  useOffline,
  useRelationshipsQuery,
  useSuggestRelationships,
  useUpdateEntityPosition,
} from '../state'
import type { Entity, ExtractionProposal, Relationship } from '../types'
import { ENTITY_TYPES } from '../types'
import { useGraphLayout } from '../hooks/useGraphLayout'
import { usePanZoom } from '../hooks/usePanZoom'
import {
  useLocalStorageBoolean,
  useLocalStorageNullable,
  useLocalStorageState,
} from '../hooks/useLocalStorageState'
import { useFreshIds } from '../hooks/useFreshIds'
import { GraphNode } from './graph/GraphNode'
import { GraphEdge } from './graph/GraphEdge'
import { GraphToolbar, type GraphMode } from './graph/GraphToolbar'
import { GraphMinimap } from './graph/GraphMinimap'
import { LoadingHint } from './LoadingHint'

// Lazy-load del renderer WebGL: sigma + graphology pesan ~165KB extra
// y solo se usan cuando la trama cruza WEBGL_THRESHOLD. Para usuarios
// con <1k entidades el bundle inicial no carga esa dependencia.
const GraphCanvasSigma = lazy(() =>
  import('./graph/GraphCanvasSigma').then((m) => ({ default: m.GraphCanvasSigma })),
)
import { EmptyState } from './EmptyState'
import { CloseIcon } from './Icons'
import type { LayoutMode } from '../hooks/layouts/types'

// Persisted in localStorage so reloads keep the user's mode + focus.
const GRAPH_MODE_KEY = 'trama.graphMode'
const GRAPH_LAYOUT_MODE_KEY = 'trama.graphLayoutMode'
const GRAPH_FOCUS_KEY = 'trama.graphFocus'
const GRAPH_EXPLORE_HINT_DISMISSED = 'trama.graphExploreHint.dismissed'

const VALID_LAYOUT_MODES: ReadonlyArray<LayoutMode> = ['organic', 'by-type', 'by-year', 'by-degree']
// Sobre este número de entidades en modo "completo", sugerimos cambiar
// a "exploratorio". Es la zona donde el render SVG empieza a notarse.
const EXPLORE_HINT_THRESHOLD = 2000
// Sobre este número, el renderer cambia automáticamente a WebGL (sigma.js).
// El SVG es rico (drop shadows, drift, etc.) pero al cruzar 1k nodos
// el render se vuelve perceptiblemente lento. WebGL pinta 10k+ sin sudar.
const WEBGL_THRESHOLD = 1000

export default function GraphView({
  selectedId,
  onSelect,
  onProposal,
}: {
  selectedId: string | null
  onSelect: (id: string | null) => void
  onProposal?: (text: string, proposal: ExtractionProposal) => void
}) {
  // Wholesale: fed by useEntitiesQuery / useRelationshipsQuery. La opción
  // "completo" usa estos. A 100k+ es inviable y se cambia a "exploratorio",
  // que ataca /api/graph/neighbors desde una entidad focal.
  const { data: allEntities = [] } = useEntitiesQuery()
  const { data: allRelationships = [] } = useRelationshipsQuery()

  const updateEntityPosition = useUpdateEntityPosition()
  const suggest = useSuggestRelationships()
  const { offline } = useOffline()
  const svgRef = useRef<SVGSVGElement>(null)
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 })
  // Default 'by-degree' (por densidad) — los hubs caen al centro y el
  // grafo se entiende a primer vistazo. La elección persiste en
  // localStorage vía useLocalStorageState.
  const [mode, setMode] = useLocalStorageState<LayoutMode>(
    GRAPH_LAYOUT_MODE_KEY,
    'by-degree',
    (raw): raw is LayoutMode => VALID_LAYOUT_MODES.includes(raw as LayoutMode),
  )
  const [suggestEmpty, setSuggestEmpty] = useState(false)

  // ζ5: hover preview — al hover prolongado sobre un nodo (~600ms) mostramos
  // una card flotante con sus stats. Estado: id de la entidad hovered + un
  // timer para el delay. Si el cursor se va antes del delay, cancelamos.
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  function scheduleHover(id: string) {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = window.setTimeout(() => {
      setHoveredEntityId(id)
    }, 600)
  }
  function cancelHover() {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setHoveredEntityId(null)
  }

  // Graph mode + focus + explore-hint, todos persistidos. El modo y el
  // nodo focal sobreviven recargas/navegación; el dismiss del hint se
  // recuerda permanentemente.
  const [graphMode, setGraphModeRaw] = useLocalStorageState<GraphMode>(
    GRAPH_MODE_KEY,
    'completo',
    (raw): raw is GraphMode => raw === 'completo' || raw === 'exploratorio',
  )
  const [exploreHintDismissed, setExploreHintDismissed] = useLocalStorageBoolean(
    GRAPH_EXPLORE_HINT_DISMISSED,
    false,
  )
  const [focusId, setFocusId] = useLocalStorageNullable(GRAPH_FOCUS_KEY)

  function setGraphMode(m: GraphMode) {
    setGraphModeRaw(m)
    // Auto-pick a focus on first switch to exploratory if none is set.
    if (m === 'exploratorio' && !focusId) {
      const candidate = selectedId ?? allEntities[0]?.id ?? null
      if (candidate) setFocusId(candidate)
    }
  }

  const neighborsQuery = useNeighborsQuery(
    graphMode === 'exploratorio' ? focusId : null,
    { hops: 2, limit: 120 },
  )

  // Decide the dataset for the rest of the render. In completo mode we use
  // the wholesale arrays. In exploratorio we use the subgraph from /neighbors.
  const entities: Entity[] =
    graphMode === 'exploratorio'
      ? (neighborsQuery.data
          ? [
              neighborsQuery.data.from,
              ...neighborsQuery.data.entities.filter(
                (e) => e.id !== neighborsQuery.data!.from.id,
              ),
            ]
          : [])
      : allEntities
  const relationships: Relationship[] =
    graphMode === 'exploratorio'
      ? (neighborsQuery.data?.relationships ?? [])
      : allRelationships

  const focusName =
    graphMode === 'exploratorio'
      ? neighborsQuery.data?.from.name ?? null
      : null
  const truncated =
    graphMode === 'exploratorio' ? neighborsQuery.data?.truncated ?? false : false

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

  // ρ-fix-B1: cuando cambia el layout mode a uno geométrico (by-type,
  // by-year, by-degree), los nodos pueden quedar lejos del viewport por
  // diseño — by-type pone clusters en un anillo de radius hasta ±2640px.
  // A zoom 0.7 (default) esos clusters no entran. Encuadramos auto al
  // bounding box de los nodos. Organic no se toca: persiste posiciones
  // del usuario y el zoom default es suficiente.
  const lastFittedModeRef = useRef<string | null>(null)
  useEffect(() => {
    if (mode === 'organic') {
      lastFittedModeRef.current = mode
      return
    }
    if (positions.size === 0) return
    // Solo refit cuando ENTRAMOS al mode (no en cada re-render del mismo).
    if (lastFittedModeRef.current === mode) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of positions.values()) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    if (!isFinite(minX)) return
    pz.fitToView({ minX, minY, maxX, maxY })
    lastFittedModeRef.current = mode
  }, [mode, positions, pz])

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

  // ζ6: cluster annotations en modo by-type. Calculamos el centroide de
  // cada cluster (promedio de posiciones de los nodos de ese tipo) y
  // rendereamos el label grande detrás. Solo se calcula en by-type
  // — en otros modos no tiene sentido (los nodos no están agrupados).
  const clusterCentroids = useMemo(() => {
    if (mode !== 'by-type') return null
    const byType = new Map<string, { sumX: number; sumY: number; count: number }>()
    for (const ent of entities) {
      const pos = positions.get(ent.id)
      if (!pos) continue
      const acc = byType.get(ent.type) ?? { sumX: 0, sumY: 0, count: 0 }
      acc.sumX += pos.x
      acc.sumY += pos.y
      acc.count += 1
      byType.set(ent.type, acc)
    }
    const result: Array<{ type: string; label: string; cx: number; cy: number; count: number }> = []
    for (const [type, { sumX, sumY, count }] of byType) {
      // Skip clusters de 1 — un solo nodo no necesita label decorativa.
      if (count < 2) continue
      const label = ENTITY_TYPES.find((t) => t.value === type)?.label ?? type
      result.push({
        type,
        label,
        cx: sumX / count,
        cy: sumY / count,
        count,
      })
    }
    return result
  }, [mode, entities, positions])

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
          const id = entities[focusedIndex]!.id
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
      // η2: en GraphView no llevamos historia de descartados (es momento
      // de exploración). El nonce del server (Date.now()) ya garantiza
      // freshness entre clicks.
      const proposal = await suggest.mutateAsync({})
      if (proposal.relationships.length === 0) {
        setSuggestEmpty(true)
        return
      }
      onProposal?.('Sugerencias entre entidades existentes', proposal)
    } catch {
      // surfaces via suggest.error
    }
  }, [suggest, onProposal])

  // Auto-dismiss the "no nuevas relaciones" toast and any suggest error after
  // a few seconds. The user can still close them manually with the X.
  useEffect(() => {
    if (!suggestEmpty) return
    const id = setTimeout(() => setSuggestEmpty(false), 6000)
    return () => clearTimeout(id)
  }, [suggestEmpty])
  useEffect(() => {
    if (!suggest.error) return
    const id = setTimeout(() => suggest.reset(), 8000)
    return () => clearTimeout(id)
  }, [suggest])

  // Auto-pick a focus when entering exploratorio without one (e.g. fresh
  // session, or the persisted focus got deleted). Defaults to the latest
  // entity to keep the experience predictable.
  useEffect(() => {
    if (graphMode !== 'exploratorio') return
    if (focusId) return
    if (allEntities.length === 0) return
    const candidate = selectedId ?? allEntities[0]?.id
    if (candidate) setFocusId(candidate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphMode, focusId, allEntities])

  // If the persisted focus is stale (entity deleted → 404), clear it so the
  // auto-pick above can run.
  useEffect(() => {
    if (graphMode !== 'exploratorio') return
    if (!neighborsQuery.isError) return
    setFocusId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphMode, neighborsQuery.isError])

  // In completo mode, the empty state means "there are no entities at all".
  // In exploratorio mode there are several "empty" possibilities:
  //   - the trama is genuinely empty → show EmptyState (no neighbors anyway)
  //   - the focus id is stale (entity was deleted) → reset focus
  //   - the neighbors query is still loading → silent (the SVG renders nothing
  //     for a moment, harmless)
  if (graphMode === 'completo' && allEntities.length === 0) {
    return <EmptyState />
  }
  if (graphMode === 'exploratorio') {
    if (allEntities.length === 0) return <EmptyState />
    if (!focusId) {
      // Auto-pick once we have data.
      // The setFocusId is safe to call inside render? No — defer.
      // Show a tiny "choose a starting point" hint.
    } else if (neighborsQuery.isError) {
      // Probably the focus was deleted. Try to recover by clearing focus.
      // Keep the toolbar visible so the user can switch modes.
    }
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
        onZoomIn={pz.zoomIn}
        onZoomOut={pz.zoomOut}
        onResetView={pz.resetView}
        entityCount={entities.length}
        relationshipCount={relationships.length}
        graphMode={graphMode}
        onGraphModeChange={setGraphMode}
        focusName={focusName}
        truncated={truncated}
        onFocusSelected={() => {
          if (selectedId) setFocusId(selectedId)
        }}
        focusSelectedDisabled={!selectedId || selectedId === focusId}
      />

      {graphMode === 'completo' &&
        !exploreHintDismissed &&
        allEntities.length > EXPLORE_HINT_THRESHOLD && (
          <div className="pointer-events-none absolute top-16 inset-x-0 z-10 flex justify-center px-3">
            <div
              className="pointer-events-auto flex items-start gap-3 pl-3 pr-1.5 py-2 bg-paper-50/95 border border-ink-100/70 rounded-lg text-xs text-ink-600 shadow-md max-w-md leading-snug"
              role="status"
            >
              <span className="flex-1">
                Tu trama ya pesa {allEntities.length.toLocaleString('es')} entidades.
                Probá <strong className="text-ink-700">explorar</strong> en la
                toolbar — pinta solo el vecindario del nodo focal y se siente
                más liviano.
              </span>
              <button
                onClick={() => {
                  setGraphMode('exploratorio')
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem(GRAPH_EXPLORE_HINT_DISMISSED, '1')
                  }
                  setExploreHintDismissed(true)
                }}
                className="shrink-0 px-2 py-0.5 rounded text-micro uppercase tracking-eyebrow text-ink-700 hover:bg-ink-50 transition-colors"
              >
                cambiar
              </button>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.localStorage.setItem(GRAPH_EXPLORE_HINT_DISMISSED, '1')
                  }
                  setExploreHintDismissed(true)
                }}
                aria-label="No recordar"
                className="shrink-0 p-1 -m-0.5 text-ink-300 hover:text-ink-700 rounded transition-colors"
              >
                <CloseIcon size={12} />
              </button>
            </div>
          </div>
        )}

      {(suggest.error || suggestEmpty) && (
        <div className="pointer-events-none absolute top-16 inset-x-0 z-10 flex justify-center px-3">
          <div
            className={
              suggest.error
                ? 'alert-error pointer-events-auto flex items-start gap-2 pl-3 pr-1.5 py-1.5 text-xs shadow-md max-w-xs'
                : 'pointer-events-auto flex items-start gap-2 pl-3 pr-1.5 py-1.5 bg-paper-50/95 border border-ink-100/70 rounded-lg text-xs text-ink-500 shadow-md max-w-xs leading-snug'
            }
            role="status"
          >
            <span className="flex-1">
              {suggest.error
                ? suggest.error.message
                : 'Sin relaciones nuevas obvias. Añade citas o descripciones para darle más contexto.'}
            </span>
            <button
              onClick={() => {
                setSuggestEmpty(false)
                if (suggest.error) suggest.reset()
              }}
              aria-label="Cerrar aviso"
              className={
                suggest.error
                  ? 'shrink-0 p-1 -m-0.5 text-red-600 hover:text-red-900 rounded transition-colors'
                  : 'shrink-0 p-1 -m-0.5 text-ink-300 hover:text-ink-700 rounded transition-colors'
              }
            >
              <CloseIcon size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Renderer switch: WebGL via sigma cuando entidades ≥ 1000 en modo
          completo. Para subgrafos (exploratorio) y trama chica, SVG. */}
      {graphMode === 'completo' && entities.length >= WEBGL_THRESHOLD ? (
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center">
              <LoadingHint text="cargando renderer" size="sm" />
            </div>
          }
        >
          <GraphCanvasSigma
            entities={entities}
            relationships={relationships}
            positions={positions}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </Suspense>
      ) : (
      <svg
        ref={svgRef}
        className="w-full h-full"
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
          {/* ζ6: cluster annotations. Labels gigantes traslúcidos en serif
              italic atrás de cada grupo en modo by-type. El grafo se
              autocomenta: "estos son tus libros", "estos tus filósofos".
              Renderizado ANTES de los edges para que quede debajo. */}
          {clusterCentroids && clusterCentroids.map(({ type, label, cx, cy }) => (
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
              style={{ userSelect: 'none', pointerEvents: 'none', textTransform: 'lowercase' }}
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
                selectedId !== null &&
                selectedId !== rel.fromId &&
                selectedId !== rel.toId
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
                onHoverStart={() => scheduleHover(entity.id)}
                onHoverEnd={cancelHover}
              />
            )
          })}
          {/* ζ5: hover preview card — al final del grupo así queda encima
              de todos los nodos. Solo render si hay hover Y la entidad
              existe en positions. */}
          {hoveredEntityId && (() => {
            const ent = entities.find((e) => e.id === hoveredEntityId)
            const pos = positions.get(hoveredEntityId)
            if (!ent || !pos) return null
            const typeLabel = ENTITY_TYPES.find((t) => t.value === ent.type)?.label ?? ent.type
            const conns = connectionCount.get(ent.id) ?? 0
            const cardW = 200
            const cardH = ent.year ? 76 : 60
            // Mostrar a la derecha del nodo si hay espacio; si no a la izq.
            // Ya que sabemos las coords del nodo, podemos offsetear.
            const offsetX = 28
            const offsetY = -cardH / 2
            return (
              <g
                transform={`translate(${pos.x + offsetX} ${pos.y + offsetY})`}
                style={{ pointerEvents: 'none' }}
                className="animate-fade-up"
              >
                <rect
                  width={cardW}
                  height={cardH}
                  rx={8}
                  ry={8}
                  fill="var(--bg-card)"
                  fillOpacity={0.98}
                  stroke="var(--border-subtle)"
                  strokeWidth={1}
                />
                {/* Eyebrow: tipo de entidad en small caps */}
                <text
                  x={12}
                  y={18}
                  fontSize={9}
                  fill="var(--ink-dim)"
                  fontFamily="Spectral, Iowan Old Style, Palatino, Georgia, serif"
                  fontStyle="italic"
                  style={{ userSelect: 'none' }}
                >
                  {typeLabel.toLowerCase()}
                  {ent.year && <> · {ent.year}</>}
                </text>
                {/* Nombre en serif */}
                <text
                  x={12}
                  y={38}
                  fontSize={14}
                  fontWeight={500}
                  fill="var(--ink)"
                  fontFamily="Spectral, Iowan Old Style, Palatino, Georgia, serif"
                  style={{ userSelect: 'none' }}
                >
                  {ent.name.length > 28 ? ent.name.slice(0, 27) + '…' : ent.name}
                </text>
                {/* Stats inline */}
                <text
                  x={12}
                  y={ent.year ? 60 : 54}
                  fontSize={10}
                  fill="var(--ink-dim)"
                  style={{ userSelect: 'none', letterSpacing: '0.05em' }}
                >
                  {conns} {conns === 1 ? 'conexión' : 'conexiones'}
                </text>
                {ent.description && (
                  <text
                    x={12}
                    y={ent.year ? 72 : 66}
                    fontSize={9.5}
                    fill="var(--ink-dim)"
                    fontStyle="italic"
                    fontFamily="Spectral, Iowan Old Style, Palatino, Georgia, serif"
                    style={{ userSelect: 'none' }}
                  >
                    {ent.description.length > 40
                      ? ent.description.slice(0, 39) + '…'
                      : ent.description}
                  </text>
                )}
              </g>
            )
          })()}
        </g>
      </svg>
      )}

      {/* π2: minimap. Solo visible con >100 nodos — con pocas entidades el
          grafo entra entero en pantalla y el minimap es chrome. Se oculta
          en modo Sigma (WebGL) porque el pan/zoom no pasa por usePanZoom
          ahí; añadir un minimap-Sigma es scope aparte. */}
      {!(graphMode === 'completo' && entities.length >= WEBGL_THRESHOLD) &&
        entities.length > 100 &&
        svgSize.width > 0 && (
        <div className="absolute bottom-3 left-3 z-10 animate-fade-up">
          <GraphMinimap
            entities={entities}
            positions={positions}
            pan={pz.pan}
            zoom={pz.zoom}
            hostWidth={svgSize.width}
            hostHeight={svgSize.height}
            onJumpTo={(x, y) => pz.setPanTo(x, y)}
          />
        </div>
      )}
    </div>
  )
}
