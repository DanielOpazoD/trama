import { useEffect, useMemo, useRef } from 'react'
import Sigma from 'sigma'
import Graph from 'graphology'
import type { Entity, Relationship } from '../../types'
import { typeAccent } from './GraphNode'
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
 * Limitaciones de este renderer (vs SVG):
 *   - Sin drag para reposicionar nodos. La idea es: a esta escala el
 *     drag no es la herramienta principal — el layout automático sí.
 *   - Sin animación de entrada/salida individual de nodos.
 *   - Edge labels no se renderizan (saturan a 1k+).
 *
 * Pan + zoom + hover + click vienen built-in en sigma.
 */
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
  const onSelectRef = useRef(onSelect)
  selectedRef.current = selectedId
  onSelectRef.current = onSelect

  const graphModel = useMemo(() => {
    const nodes = entities.flatMap((e) => {
      const pos = positions.get(e.id)
      if (!pos) return []
      return [
        {
          id: e.id,
          data: {
            // Sigma's coord system: x positive right, y positive UP.
            // Nuestro layout usa y positive DOWN. Invertimos.
            x: pos.x,
            y: -pos.y,
            size: 6,
            label: e.name,
            color: typeAccent(e.type),
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
            color: 'rgba(80, 80, 80, 0.18)',
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
    if (!containerRef.current) return

    const model = graphModelRef.current
    const graph = new Graph()

    for (const node of model.nodes) {
      graph.addNode(node.id, node.data)
    }

    for (const edge of model.edges) {
      graph.addEdge(edge.fromId, edge.toId, edge.data)
    }

    // Renderer config: priorizar perf sobre fidelidad visual.
    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      renderLabels: model.renderLabels, // a 500+ labels saturan, off por default
      labelColor: { color: '#3a3429' },
      labelSize: 11,
      labelWeight: '400',
      labelFont: 'Inter, ui-sans-serif, system-ui, sans-serif',
      defaultEdgeColor: 'rgba(80, 80, 80, 0.18)',
      defaultNodeColor: '#7a6748',
      // Reducers permiten estilo dinámico (selected/hovered) sin reconstruir
      // el grafo. Se evalúan en cada frame; deben ser baratos.
      nodeReducer: (node, data) => {
        const res = { ...data }
        if (selectedRef.current === node) {
          res.size = (data.size as number) * 1.6
          res.color = '#1A1812'
          res.zIndex = 2
        }
        return res
      },
      edgeReducer: (edge, data) => {
        const res = { ...data }
        // Resaltar aristas incidentes al nodo seleccionado.
        if (selectedRef.current) {
          const [u, v] = graph.extremities(edge)
          if (u === selectedRef.current || v === selectedRef.current) {
            res.color = 'rgba(31, 77, 107, 0.55)' // accent-primary
            res.size = 1.5
            res.zIndex = 1
          } else {
            res.color = 'rgba(120, 120, 120, 0.10)'
          }
        }
        return res
      },
    })

    sigma.on('clickNode', ({ node }) => {
      onSelectRef.current(node)
    })
    sigma.on('clickStage', () => {
      onSelectRef.current(null)
    })

    sigmaRef.current = sigma

    return () => {
      sigma.kill()
      sigmaRef.current = null
    }
  }, [graphSignature])

  // Si solo cambió la selección: refresh sin reconstruir.
  useEffect(() => {
    if (!sigmaRef.current) return
    sigmaRef.current.refresh()
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
