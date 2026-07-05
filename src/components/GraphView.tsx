import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
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
import type { Entity, ExtractionProposal } from '../types'
import { useGraphLayout } from '../hooks/useGraphLayout'
import { usePanZoom } from '../hooks/usePanZoom'
import { useIsMobile } from '../hooks/useIsMobile'
import { useGraphKeyboardNav } from '../hooks/useGraphKeyboardNav'
import {
  useLocalStorageBoolean,
  useLocalStorageNullable,
  useLocalStorageState,
} from '../hooks/useLocalStorageState'
import { useFreshIds } from '../hooks/useFreshIds'
import { GraphToolbar, type GraphMode } from './graph/GraphToolbar'
import { GraphMinimap } from './graph/GraphMinimap'
import { GraphTypeLegend } from './graph/GraphTypeLegend'
import { GraphSearch } from './graph/GraphSearch'
import { GraphExploreHint } from './graph/GraphExploreHint'
import { GraphSuggestStatusBanner } from './graph/GraphSuggestStatusBanner'
import { GraphSvgCanvas } from './graph/GraphSvgCanvas'
import {
  computeClusterCentroids,
  computeConnectionCount,
  selectGraphDataset,
} from './graph/graphViewModel'
import { useGraphHoverPreview } from './graph/useGraphHoverPreview'
import { useGraphSvgMeasure, useGraphViewportFit } from './graph/useGraphViewport'
import { LoadingHint } from './LoadingHint'

// Lazy-load del renderer WebGL: sigma + graphology pesan ~165KB extra
// y solo se usan cuando la trama cruza WEBGL_THRESHOLD. Para usuarios
// con <1k entidades el bundle inicial no carga esa dependencia.
const GraphCanvasSigma = lazy(() =>
  import('./graph/GraphCanvasSigma').then((m) => ({ default: m.GraphCanvasSigma })),
)
import { EmptyState } from './EmptyState'
import { GraphLoadingState } from './graph/GraphLoadingState'
import type { LayoutMode } from '../hooks/layouts/types'

// Persisted in localStorage so reloads keep the user's mode + focus.
const GRAPH_MODE_KEY = 'trama.graphMode'
const GRAPH_LAYOUT_MODE_KEY = 'trama.graphLayoutMode'
const GRAPH_FOCUS_KEY = 'trama.graphFocus'
const GRAPH_EXPLORE_HINT_DISMISSED = 'trama.graphExploreHint.dismissed'

const VALID_LAYOUT_MODES: ReadonlyArray<LayoutMode> = [
  'organic',
  'by-type',
  'by-year',
  'by-degree',
]
// Sobre este número de entidades en modo "completo", sugerimos cambiar
// a "exploratorio". Es la zona donde el render SVG empieza a notarse.
const EXPLORE_HINT_THRESHOLD = 2000
// Sobre este número, el renderer cambia automáticamente a WebGL (sigma.js).
// El SVG es rico (drop shadows, drift, etc.) pero al cruzar 1k nodos
// el render se vuelve perceptiblemente lento. WebGL pinta 10k+ sin sudar.
const WEBGL_THRESHOLD = 600
// ω-panel: px que se desplaza el viewport a la izquierda al seleccionar un
// nodo con el panel de detalle abierto (~40rem de ancho → media anchura), para
// que el nodo y sus vecinos queden a la vista y no bajo el panel.
const PANEL_RECENTER_DX = 320

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
  const { data: allEntities = [], isLoading: entitiesLoading } = useEntitiesQuery()
  const { data: allRelationships = [] } = useRelationshipsQuery()

  const updateEntityPosition = useUpdateEntityPosition()
  const suggest = useSuggestRelationships()
  const { offline } = useOffline()
  const svgRef = useRef<SVGSVGElement | null>(null)
  const { svgSize, setGraphSvgRef } = useGraphSvgMeasure(svgRef)
  // Default 'by-degree' (por densidad) — los hubs caen al centro y el
  // grafo se entiende a primer vistazo. La elección persiste en
  // localStorage vía useLocalStorageState.
  const [mode, setMode] = useLocalStorageState<LayoutMode>(
    GRAPH_LAYOUT_MODE_KEY,
    'by-degree',
    (raw): raw is LayoutMode => VALID_LAYOUT_MODES.includes(raw as LayoutMode),
  )
  const [suggestEmpty, setSuggestEmpty] = useState(false)
  // ω-leyenda: tipo resaltado al pasar el cursor por la leyenda — enciende
  // sus nodos y atenúa el resto (solo cuando no hay una selección activa).
  const [hoveredType, setHoveredType] = useState<string | null>(null)

  const { hoveredEntityId, scheduleHover, cancelHover } = useGraphHoverPreview()

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
  const selectedIdRef = useRef(selectedId)

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

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
  const { entities, relationships } = useMemo(
    () =>
      selectGraphDataset({
        graphMode,
        allEntities,
        allRelationships,
        neighbors: neighborsQuery.data,
      }),
    [allEntities, allRelationships, graphMode, neighborsQuery.data],
  )

  const focusName =
    graphMode === 'exploratorio' ? (neighborsQuery.data?.from.name ?? null) : null
  const truncated =
    graphMode === 'exploratorio' ? (neighborsQuery.data?.truncated ?? false) : false

  const { positions, setPosition, reorganize, computing } = useGraphLayout({
    mode,
    nodes: entities,
    edges: relationships,
  })

  const pz = usePanZoom(svgRef)
  const isMobile = useIsMobile()

  // ρ-fix-B1: cuando cambia el layout mode a uno geométrico (by-type,
  // by-year, by-degree), los nodos pueden quedar lejos del viewport por
  // diseño — by-type pone clusters en un anillo de radius hasta ±2640px.
  // A zoom 0.7 (default) esos clusters no entran. Encuadramos auto al
  // bounding box de los nodos. Organic no se toca: persiste posiciones
  // del usuario y el zoom default es suficiente.
  useGraphViewportFit({
    mode,
    svgSize,
    entityCount: entities.length,
    relationshipCount: relationships.length,
    positions,
    panZoom: pz,
  })

  const freshEntities = useFreshIds(entities.map((e) => e.id))
  const freshRels = useFreshIds(relationships.map((r) => r.id))

  const connectionCount = useMemo(
    () => computeConnectionCount(relationships),
    [relationships],
  )

  // ζ6: cluster annotations en modo by-type. Calculamos el centroide de
  // cada cluster (promedio de posiciones de los nodos de ese tipo) y
  // rendereamos el label grande detrás. Solo se calcula en by-type
  // — en otros modos no tiene sentido (los nodos no están agrupados).
  const clusterCentroids = useMemo(
    () => computeClusterCentroids(mode, entities, positions),
    [mode, entities, positions],
  )

  const {
    focusedIndex,
    setFocusedIndex,
    onKeyDown: handleKeyDown,
  } = useGraphKeyboardNav({
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
    const candidate = selectedIdRef.current ?? allEntities[0]?.id
    if (candidate) setFocusId(candidate)
  }, [graphMode, focusId, allEntities, setFocusId])

  // If the persisted focus is stale (entity deleted → 404), clear it so the
  // auto-pick above can run.
  useEffect(() => {
    if (graphMode !== 'exploratorio') return
    if (!neighborsQuery.isError) return
    setFocusId(null)
  }, [graphMode, neighborsQuery.isError, setFocusId])

  // ω-panel: al seleccionar un nodo (desktop), reencuadra el viewport para que
  // quede a la vista, a la izquierda del panel de detalle. Solo una vez por
  // selección — el ref evita reencuadrar al arrastrar o al recalcular layout.
  const recenteredForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedId) {
      recenteredForRef.current = null
      return
    }
    if (isMobile || selectedId === recenteredForRef.current) return
    const pos = positions.get(selectedId)
    if (!pos) return
    recenteredForRef.current = selectedId
    pz.setPanTo(pos.x, pos.y, -PANEL_RECENTER_DX)
  }, [selectedId, isMobile, positions, pz])

  // Empty state: en modo "completo" sin entidades, mostramos el EmptyState
  // global. En "exploratorio" sin entidades pasa lo mismo (no hay focus
  // candidato). Los otros casos (focus null, focus stale) se manejan con
  // los effects de auto-pick / clear de arriba.
  if (allEntities.length === 0) {
    // ω-carga: distinguir "cargando" de "vacío de verdad". Mientras la query
    // trae las entidades, un indicador sereno; el EmptyState («no hay
    // entidades, cargar ejemplo») solo cuando de verdad no hay nada — antes
    // se veía un flash de ese vacío en cada carga.
    return entitiesLoading ? <GraphLoadingState /> : <EmptyState />
  }
  // Exploratorio: el subgrafo focal puede venir vacío mientras el neighbors
  // query resuelve (aunque el wholesale ya tenga entidades). Evita el canvas
  // en blanco con el mismo indicador sereno.
  if (graphMode === 'exploratorio' && entities.length === 0) {
    return neighborsQuery.isLoading ? <GraphLoadingState /> : <EmptyState />
  }

  const cursorStyle: CSSProperties = { cursor: pz.isPanning ? 'grabbing' : 'grab' }
  const showExploreHint =
    graphMode === 'completo' &&
    !exploreHintDismissed &&
    allEntities.length > EXPLORE_HINT_THRESHOLD
  const useWebGl = graphMode === 'completo' && entities.length >= WEBGL_THRESHOLD

  function dismissExploreHint() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(GRAPH_EXPLORE_HINT_DISMISSED, '1')
    }
    setExploreHintDismissed(true)
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
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

      {/* Leyenda de tipos — qué color es qué voz, plegada por default.
          Al pasar el cursor por un tipo, sus nodos se encienden en el grafo. */}
      <GraphTypeLegend entities={entities} onHoverType={setHoveredType} />

      {/* Buscar y saltar a un nodo — «/» enfoca; la selección viaja sola. */}
      <GraphSearch entities={entities} onSelect={(id) => onSelect(id)} />

      {/* Voz de espera mientras el worker teje un layout grande — sin
          esto, miles de nodos significan segundos de blanco silencioso. */}
      {computing && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center"
        >
          <span className="rounded-full border border-ink-100/70 bg-paper-50/90 px-3 py-1 text-caption font-serif italic text-ink-400 shadow-sm backdrop-blur-sm">
            tejiendo el grafo…
          </span>
        </div>
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
          svgRef={setGraphSvgRef}
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
          hoveredType={hoveredType}
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
