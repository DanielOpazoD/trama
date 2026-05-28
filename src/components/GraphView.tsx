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
import { useGraphKeyboardNav } from '../hooks/useGraphKeyboardNav'
import {
  useLocalStorageBoolean,
  useLocalStorageNullable,
  useLocalStorageState,
} from '../hooks/useLocalStorageState'
import { useFreshIds } from '../hooks/useFreshIds'
import { GraphToolbar, type GraphMode } from './graph/GraphToolbar'
import { GraphMinimap } from './graph/GraphMinimap'
import { GraphExploreHint } from './graph/GraphExploreHint'
import { GraphSuggestStatusBanner } from './graph/GraphSuggestStatusBanner'
import { GraphSvgCanvas } from './graph/GraphSvgCanvas'
import { LoadingHint } from './LoadingHint'

// Lazy-load del renderer WebGL: sigma + graphology pesan ~165KB extra
// y solo se usan cuando la trama cruza WEBGL_THRESHOLD. Para usuarios
// con <1k entidades el bundle inicial no carga esa dependencia.
const GraphCanvasSigma = lazy(() =>
  import('./graph/GraphCanvasSigma').then((m) => ({ default: m.GraphCanvasSigma })),
)
import { EmptyState } from './EmptyState'
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

  const { focusedIndex, setFocusedIndex, onKeyDown: handleKeyDown } = useGraphKeyboardNav({
    entities,
    selectedId,
    onSelect,
  })

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
    [onSelect, selectedId, setFocusedIndex],
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

  // Empty state: en modo "completo" sin entidades, mostramos el EmptyState
  // global. En "exploratorio" sin entidades pasa lo mismo (no hay focus
  // candidato). Los otros casos (focus null, focus stale) se manejan con
  // los effects de auto-pick / clear de arriba.
  if (graphMode === 'completo' && allEntities.length === 0) {
    return <EmptyState />
  }
  if (graphMode === 'exploratorio' && allEntities.length === 0) {
    return <EmptyState />
  }

  const cursorStyle: CSSProperties = { cursor: pz.isPanning ? 'grabbing' : 'grab' }
  const showExploreHint =
    graphMode === 'completo' &&
    !exploreHintDismissed &&
    allEntities.length > EXPLORE_HINT_THRESHOLD
  const useWebGl =
    graphMode === 'completo' && entities.length >= WEBGL_THRESHOLD

  function dismissExploreHint() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GRAPH_EXPLORE_HINT_DISMISSED, '1')
    }
    setExploreHintDismissed(true)
  }

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

      {showExploreHint && (
        <GraphExploreHint
          entityCount={allEntities.length}
          onSwitch={() => {
            setGraphMode('exploratorio')
            dismissExploreHint()
          }}
          onDismiss={dismissExploreHint}
        />
      )}

      {(suggest.error || suggestEmpty) && (
        <GraphSuggestStatusBanner
          error={suggest.error ?? null}
          onClose={() => {
            setSuggestEmpty(false)
            if (suggest.error) suggest.reset()
          }}
        />
      )}

      {/* Renderer switch: WebGL via sigma cuando entidades ≥ 1000 en modo
          completo. Para subgrafos (exploratorio) y trama chica, SVG. */}
      {useWebGl ? (
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
        <GraphSvgCanvas
          svgRef={svgRef}
          svgSize={svgSize}
          cursorStyle={cursorStyle}
          pan={pz.pan}
          zoom={pz.zoom}
          mode={mode}
          entities={entities}
          relationships={relationships}
          positions={positions}
          selectedId={selectedId}
          focusedIndex={focusedIndex}
          freshEntities={freshEntities}
          freshRels={freshRels}
          connectionCount={connectionCount}
          clusterCentroids={clusterCentroids}
          hoveredEntityId={hoveredEntityId}
          onSvgMouseDown={pz.onMouseDown}
          onSvgMouseMove={handleMouseMove}
          onSvgMouseUp={handleMouseUp}
          onSvgWheel={pz.onWheel}
          onBackgroundClick={handleBackgroundClick}
          onKeyDown={handleKeyDown}
          onNodeMouseDown={handleNodeMouseDown}
          onNodeClick={handleNodeClick}
          onNodeHoverStart={scheduleHover}
          onNodeHoverEnd={cancelHover}
        />
      )}

      {/* π2: minimap. Solo visible con >100 nodos — con pocas entidades el
          grafo entra entero en pantalla y el minimap es chrome. Se oculta
          en modo Sigma (WebGL) porque el pan/zoom no pasa por usePanZoom
          ahí; añadir un minimap-Sigma es scope aparte. */}
      {!useWebGl && entities.length > 100 && svgSize.width > 0 && (
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
