import { useEffect, useRef } from 'react'
import Sigma from 'sigma'
import Graph from 'graphology'
import type { Entity, Relationship } from '../../types'
import { typeAccent } from './GraphNode'

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

  // (Re)construir el grafo cuando cambian los datos. Sigma es caro de
  // crear; cuando solo cambia la selección no recreamos — usamos
  // refresh() con el reducer.
  useEffect(() => {
    if (!containerRef.current) return

    const graph = new Graph()

    for (const e of entities) {
      const pos = positions.get(e.id)
      if (!pos) continue
      graph.addNode(e.id, {
        // Sigma's coord system: x positive right, y positive UP.
        // Nuestro layout usa y positive DOWN. Invertimos.
        x: pos.x,
        y: -pos.y,
        size: 6,
        label: e.name,
        color: typeAccent(e.type),
        entityType: e.type,
      })
    }

    let edgeCount = 0
    for (const r of relationships) {
      if (!graph.hasNode(r.fromId) || !graph.hasNode(r.toId)) continue
      // Evitar duplicados / self-loops en la representación visual.
      if (r.fromId === r.toId) continue
      if (graph.hasEdge(r.fromId, r.toId)) continue
      graph.addEdge(r.fromId, r.toId, {
        type: 'arrow',
        size: 1,
        color: 'rgba(80, 80, 80, 0.18)',
        relType: r.type,
      })
      edgeCount += 1
    }

    // Renderer config: priorizar perf sobre fidelidad visual.
    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      renderLabels: entities.length < 500, // a 500+ labels saturan, off por default
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
    console.info(`[GraphCanvasSigma] WebGL: ${entities.length} nodes, ${edgeCount} edges`)

    return () => {
      sigma.kill()
      sigmaRef.current = null
    }
    // El positions Map cambia su referencia con cada render del layout,
    // pero las posiciones individuales son estables por id en cada modo.
    // Reconstruimos cuando cambia tamaño o el modo (no por cada drag).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities.length, relationships.length])

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
