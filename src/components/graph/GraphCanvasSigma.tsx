import { useEffect, useMemo, useRef } from 'react'
import Sigma from 'sigma'
import Graph from 'graphology'
import type { Entity, Relationship } from '../../types'
import {
  graphHashToSignature,
  hashGraphPart,
  initialGraphHash,
} from '../../lib/graphSignature'

/**
 * Renderer WebGL para el grafo. Se activa cuando hay muchos nodos
 * (≥ ~1000) y el SVG empieza a notarse. Para subgrafos pequeños el
 * SVG sigue siendo mejor (más rico visualmente, animaciones, etc.).
 *
 * A esta escala el grafo se lee con tres gestos:
 *   - LOD de labels: sigma solo rotula nodos cuyo tamaño renderizado
 *     supera el umbral — al alejar, el bosque; al acercar, los nombres.
 *   - Linterna: hover sobre un nodo atenúa todo lo que no es él ni sus
 *     vecinos. La selección hace lo mismo, persistente, y la cámara
 *     viaja suave hasta el nodo.
 *   - Peso visual por grado: los nodos más conectados son más grandes
 *     (escala sqrt, 4–13px) — la jerarquía del archivo se ve sin leer.
 *
 * Colores desde los tokens del tema activo (CSS vars leídas al montar):
 * el grafo es legible en Papel, Noche y Vela.
 *
 * Limitaciones (vs SVG): sin drag de nodos ni edge labels (saturan a 1k+).
 */

/** WebGL no entiende `var(--type-x)`: resolvemos los acentos por tipo a
 *  colores literales leyendo las CSS vars del tema activo una vez por
 *  construcción del modelo. Tipos sin var definida caen al default. */
function resolveTypeColors(types: Iterable<string>): Map<string, string> {
  const out = new Map<string, string>()
  if (typeof window === 'undefined') return out
  const styles = getComputedStyle(document.documentElement)
  const fallback = styles.getPropertyValue('--type-default').trim() || '#7a6748'
  for (const t of types) {
    const safe = t.replace(/[^a-z0-9_-]/gi, '')
    const v = safe ? styles.getPropertyValue(`--type-${safe}`).trim() : ''
    out.set(t, v || fallback)
  }
  return out
}

/** Lee los tokens del tema activo para tinta/labels del canvas WebGL. */
function readThemeInk(): { label: string; edge: string } {
  const fallback = { label: '#3a3429', edge: 'rgba(80, 80, 80, 0.18)' }
  if (typeof window === 'undefined') return fallback
  const styles = getComputedStyle(document.documentElement)
  return {
    label: styles.getPropertyValue('--graph-label-ink').trim() || fallback.label,
    edge: styles.getPropertyValue('--graph-edge-ink').trim() || fallback.edge,
  }
}
export function GraphCanvasSigma({
  entities,
  relationships,
  positions,
  selectedId,
  onSelect,
}: {
  entities: Entity[]
  relationships: Relationship[]
  positions: Map<string, { x: number; y: number }>
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const selectedRef = useRef<string | null>(selectedId)
  const hoveredRef = useRef<string | null>(null)
  const onSelectRef = useRef(onSelect)
  selectedRef.current = selectedId
  onSelectRef.current = onSelect

  const graphModel = useMemo(() => {
    // Grado por nodo → peso visual (sqrt para comprimir la cola larga).
    const degree = new Map<string, number>()
    for (const r of relationships) {
      degree.set(r.fromId, (degree.get(r.fromId) ?? 0) + 1)
      degree.set(r.toId, (degree.get(r.toId) ?? 0) + 1)
    }
    // A más nodos, puntos más finos: el grafo respira en vez de
    // empastarse (la extensión del layout no crece con N).
    const typeColors = resolveTypeColors(new Set(entities.map((e) => e.type)))
    const dense = entities.length > 800
    const base = dense ? 2 : 4
    const cap = dense ? 9 : 13
    const k = dense ? 1.4 : 2.2
    const nodes = entities.flatMap((e) => {
      const pos = positions.get(e.id)
      if (!pos) return []
      const d = degree.get(e.id) ?? 0
      return [
        {
          id: e.id,
          data: {
            // Sigma's coord system: x positive right, y positive UP.
            // Nuestro layout usa y positive DOWN. Invertimos.
            x: pos.x,
            y: -pos.y,
            size: Math.min(cap, base + Math.sqrt(d) * k),
            label: e.name,
            color: typeColors.get(e.type) ?? '#7a6748',
            entityType: e.type,
          },
        },
      ]
    })
    const nodeIds = new Set(nodes.map((node) => node.id))
    const edgeKeys = new Set<string>()
    const edges = relationships.flatMap((r) => {
      if (!nodeIds.has(r.fromId) || !nodeIds.has(r.toId)) return []
      if (r.fromId === r.toId) return []
      const key = `${r.fromId}->${r.toId}`
      if (edgeKeys.has(key)) return []
      edgeKeys.add(key)
      return [
        {
          fromId: r.fromId,
          toId: r.toId,
          data: {
            type: 'arrow',
            size: 1,
            relType: r.type,
          },
        },
      ]
    })
    return { nodes, edges, renderLabels: entities.length < 500 }
  }, [entities, positions, relationships])
  const graphSignature = useMemo(() => {
    let hash = initialGraphHash()
    hash = hashGraphPart(hash, graphModel.renderLabels ? 'labels:on' : 'labels:off')
    hash = hashGraphPart(hash, graphModel.nodes.length)
    for (const node of graphModel.nodes) {
      hash = hashGraphPart(hash, node.id)
      hash = hashGraphPart(hash, node.data.x)
      hash = hashGraphPart(hash, node.data.y)
      hash = hashGraphPart(hash, node.data.label)
      hash = hashGraphPart(hash, node.data.entityType)
      hash = hashGraphPart(hash, node.data.color)
    }
    hash = hashGraphPart(hash, graphModel.edges.length)
    for (const edge of graphModel.edges) {
      hash = hashGraphPart(hash, edge.fromId)
      hash = hashGraphPart(hash, edge.toId)
      hash = hashGraphPart(hash, edge.data.type)
      hash = hashGraphPart(hash, edge.data.relType)
    }
    return graphHashToSignature(hash)
  }, [graphModel])
  const graphModelRef = useRef(graphModel)
  graphModelRef.current = graphModel

  // (Re)construir el grafo cuando cambian los datos. Sigma es caro de
  // crear; cuando solo cambia la selección no recreamos — usamos
  // refresh() con el reducer.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const model = graphModelRef.current
    const graph = new Graph()

    for (const node of model.nodes) {
      graph.addNode(node.id, node.data)
    }

    for (const edge of model.edges) {
      graph.addEdge(edge.fromId, edge.toId, edge.data)
    }

    // Renderer config: priorizar perf sobre fidelidad visual.
    const ink = readThemeInk()
    // allowInvalidContainer: el layout puede llegar async (worker) con el
    // flex aún acomodándose; Sigma v3 trae ResizeObserver y se ajusta solo
    // cuando el contenedor gana ancho — sin esto, tiraba en el mount.
    const instance = new Sigma(graph, container, {
      allowInvalidContainer: true,
      renderEdgeLabels: false,
      renderLabels: true,
      // LOD: solo se rotulan nodos cuyo tamaño renderizado supera el
      // umbral — con miles de nodos, los nombres aparecen al acercarse.
      labelRenderedSizeThreshold: model.renderLabels ? 6 : 9,
      labelColor: { color: ink.label },
      labelSize: 11,
      labelWeight: '400',
      labelFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
      defaultEdgeColor: ink.edge,
      defaultNodeColor: '#7a6748',
      // Reducers permiten estilo dinámico (selected/hovered) sin reconstruir
      // el grafo. Se evalúan en cada frame; deben ser baratos.
      nodeReducer: (node, data) => {
        const res = { ...data }
        const focus = hoveredRef.current ?? selectedRef.current
        if (selectedRef.current === node) {
          res.size = (data.size as number) * 1.5
          res.zIndex = 2
          res.highlighted = true
        }
        // Linterna: con un foco activo, lo que no es el foco ni vecino
        // se apaga — el barrio del nodo queda iluminado.
        if (focus && node !== focus && !graph.areNeighbors(node, focus)) {
          res.color = 'rgba(128, 128, 128, 0.12)'
          res.label = ''
        }
        return res
      },
      edgeReducer: (edge, data) => {
        const res = { ...data }
        const focus = hoveredRef.current ?? selectedRef.current
        if (focus) {
          const [u, v] = graph.extremities(edge)
          if (u === focus || v === focus) {
            res.color = 'rgba(31, 77, 107, 0.55)' // accent-primary
            res.size = 1.5
            res.zIndex = 1
          } else {
            res.color = 'rgba(120, 120, 120, 0.05)'
          }
        }
        return res
      },
    })

    // Linterna en hover — barata: solo refresh de reducers, sin relayout.
    instance.on('enterNode', ({ node }) => {
      hoveredRef.current = node
      containerRef.current?.style.setProperty('cursor', 'pointer')
      instance.refresh({ skipIndexation: true })
    })
    instance.on('leaveNode', () => {
      hoveredRef.current = null
      containerRef.current?.style.setProperty('cursor', 'default')
      instance.refresh({ skipIndexation: true })
    })

    instance.on('clickNode', ({ node }) => {
      onSelectRef.current(node)
    })
    instance.on('clickStage', () => {
      onSelectRef.current(null)
    })

    sigmaRef.current = instance

    return () => {
      instance.kill()
      sigmaRef.current = null
    }
  }, [graphSignature])

  // Si solo cambió la selección: refresh sin reconstruir, y la cámara
  // viaja suave hasta el nodo (mismo gesto out-quart de la casa).
  useEffect(() => {
    const sigma = sigmaRef.current
    if (!sigma) return
    sigma.refresh()
    if (!selectedId || !sigma.getGraph().hasNode(selectedId)) return
    const display = sigma.getNodeDisplayData(selectedId)
    if (!display) return
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    sigma
      .getCamera()
      .animate(
        { x: display.x, y: display.y },
        { duration: reduced ? 0 : 450, easing: 'quadraticOut' },
      )
  }, [selectedId])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      role="application"
      aria-label={`Grafo (WebGL). ${entities.length} entidades, ${relationships.length} relaciones. Clic en un nodo para seleccionar, fondo para deseleccionar.`}
    />
  )
}
