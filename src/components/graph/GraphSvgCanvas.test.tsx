import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { GraphSvgCanvas } from './GraphSvgCanvas'
import type { Entity, Relationship } from '../../types'

// Smoke tests del canvas SVG. El componente es 100% presentacional —
// no tiene estado ni efectos — así que solo necesitamos verificar que:
//   - acepta el shape de props sin errores en runtime
//   - el aria-label refleja entityCount / relationshipCount / mode
//   - los handlers se exponen sobre el <svg>
// No testeamos la geometría de los nodos (eso vive en GraphLayout/GraphNode
// y tiene sus propios tests).

function ent(id: string, type = 'persona'): Entity {
  return {
    id,
    name: id,
    type,
    description: null,
    year: null,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    origin: { kind: 'manual' },
  } as unknown as Entity
}

function rel(id: string, fromId: string, toId: string): Relationship {
  return {
    id,
    fromId,
    toId,
    type: 'asociado_con',
    notes: null,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    origin: { kind: 'manual' },
  } as unknown as Relationship
}

const noopProps = {
  onSvgMouseDown: vi.fn(),
  onSvgMouseMove: vi.fn(),
  onSvgMouseUp: vi.fn(),
  onSvgWheel: vi.fn(),
  onBackgroundClick: vi.fn(),
  onKeyDown: vi.fn(),
  onNodeMouseDown: vi.fn(),
  onNodeClick: vi.fn(),
  onNodeHoverStart: vi.fn(),
  onNodeHoverEnd: vi.fn(),
}

describe('<GraphSvgCanvas />', () => {
  it('renderiza sin errores con entities vacías', () => {
    render(
      <GraphSvgCanvas
        svgRef={createRef<SVGSVGElement>()}
        svgSize={{ width: 800, height: 600 }}
        cursorStyle={{ cursor: 'grab' }}
        pan={{ x: 0, y: 0 }}
        zoom={1}
        mode="by-degree"
        entities={[]}
        relationships={[]}
        positions={new Map()}
        selectedId={null}
        focusedIndex={-1}
        freshEntities={new Set()}
        freshRels={new Set()}
        connectionCount={new Map()}
        clusterCentroids={null}
        hoveredEntityId={null}
        hoveredType={null}
        {...noopProps}
      />,
    )
    expect(screen.getByRole('application')).toBeInTheDocument()
  })

  it('aria-label incluye conteo + modo', () => {
    const entities = [ent('a'), ent('b'), ent('c')]
    const relationships = [rel('r1', 'a', 'b')]
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 100, y: 0 }],
      ['c', { x: 50, y: 100 }],
    ])
    render(
      <GraphSvgCanvas
        svgRef={createRef<SVGSVGElement>()}
        svgSize={{ width: 800, height: 600 }}
        cursorStyle={{ cursor: 'grab' }}
        pan={{ x: 0, y: 0 }}
        zoom={1}
        mode="organic"
        entities={entities}
        relationships={relationships}
        positions={positions}
        selectedId={null}
        focusedIndex={-1}
        freshEntities={new Set()}
        freshRels={new Set()}
        connectionCount={new Map()}
        clusterCentroids={null}
        hoveredEntityId={null}
        hoveredType={null}
        {...noopProps}
      />,
    )
    const svg = screen.getByRole('application')
    expect(svg.getAttribute('aria-label')).toMatch(/3 entidades/)
    expect(svg.getAttribute('aria-label')).toMatch(/1 relaciones/)
    expect(svg.getAttribute('aria-label')).toMatch(/Modo organic/)
  })

  it('en modo by-type pinta cluster centroids cuando se proveen', () => {
    const entities = [ent('a', 'persona'), ent('b', 'persona')]
    const positions = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 100, y: 0 }],
    ])
    const { container } = render(
      <GraphSvgCanvas
        svgRef={createRef<SVGSVGElement>()}
        svgSize={{ width: 800, height: 600 }}
        cursorStyle={{ cursor: 'grab' }}
        pan={{ x: 0, y: 0 }}
        zoom={1}
        mode="by-type"
        entities={entities}
        relationships={[]}
        positions={positions}
        selectedId={null}
        focusedIndex={-1}
        freshEntities={new Set()}
        freshRels={new Set()}
        connectionCount={new Map()}
        clusterCentroids={[
          { type: 'persona', label: 'personas', cx: 50, cy: 0, count: 2 },
        ]}
        hoveredEntityId={null}
        hoveredType={null}
        {...noopProps}
      />,
    )
    // El label "personas" aparece como <text> en el SVG.
    expect(container.querySelector('text')?.textContent).toBe('personas')
  })

  it('cuando clusterCentroids es null no pinta ningún cluster label', () => {
    const { container } = render(
      <GraphSvgCanvas
        svgRef={createRef<SVGSVGElement>()}
        svgSize={{ width: 800, height: 600 }}
        cursorStyle={{ cursor: 'grab' }}
        pan={{ x: 0, y: 0 }}
        zoom={1}
        mode="organic"
        entities={[]}
        relationships={[]}
        positions={new Map()}
        selectedId={null}
        focusedIndex={-1}
        freshEntities={new Set()}
        freshRels={new Set()}
        connectionCount={new Map()}
        clusterCentroids={null}
        hoveredEntityId={null}
        hoveredType={null}
        {...noopProps}
      />,
    )
    // El único <text> que podría haber serían los cluster labels o
    // labels de nodos. Sin entidades y sin clusters → 0 <text>.
    expect(container.querySelectorAll('text').length).toBe(0)
  })
})
