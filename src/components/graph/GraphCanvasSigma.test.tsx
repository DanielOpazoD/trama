import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Entity, Relationship } from '../../types'

const sigmaMocks = vi.hoisted(() => {
  class MockGraph {
    nodes = new Map<string, Record<string, unknown>>()
    edges = new Map<
      string,
      { source: string; target: string; data: Record<string, unknown> }
    >()

    addNode(id: string, data: Record<string, unknown>) {
      this.nodes.set(id, data)
    }

    hasNode(id: string) {
      return this.nodes.has(id)
    }

    addEdge(source: string, target: string, data: Record<string, unknown>) {
      this.edges.set(`${source}->${target}`, { source, target, data })
    }

    hasEdge(source: string, target: string) {
      return this.edges.has(`${source}->${target}`)
    }

    extremities(edge: string) {
      const found = this.edges.get(edge)
      return found ? [found.source, found.target] : ['', '']
    }
  }

  class MockSigma {
    static instances: MockSigma[] = []

    graph: MockGraph
    container: HTMLElement
    config: Record<string, unknown>
    handlers = new Map<string, (event?: unknown) => void>()
    refresh = vi.fn()
    kill = vi.fn()

    constructor(
      graph: MockGraph,
      container: HTMLElement,
      config: Record<string, unknown>,
    ) {
      this.graph = graph
      this.container = container
      this.config = config
      MockSigma.instances.push(this)
    }

    on(event: string, handler: (event?: unknown) => void) {
      this.handlers.set(event, handler)
    }
  }

  return { MockGraph, MockSigma }
})

vi.mock('graphology', () => ({
  default: sigmaMocks.MockGraph,
}))

vi.mock('sigma', () => ({
  default: sigmaMocks.MockSigma,
}))

import { GraphCanvasSigma } from './GraphCanvasSigma'

function ent(id: string, type = 'persona'): Entity {
  return {
    id,
    name: id,
    type,
    createdAt: '',
    updatedAt: '',
    origin: { kind: 'manual' },
  }
}

function rel(id: string, fromId: string, toId: string): Relationship {
  return {
    id,
    fromId,
    toId,
    type: 'asociado_con',
    createdAt: '',
    updatedAt: '',
    origin: { kind: 'manual' },
  }
}

describe('<GraphCanvasSigma />', () => {
  beforeEach(() => {
    sigmaMocks.MockSigma.instances.length = 0
  })

  it('construye el grafo solo con nodos posicionados y relaciones válidas', () => {
    render(
      <GraphCanvasSigma
        entities={[ent('a'), ent('b'), ent('missing-position')]}
        relationships={[
          rel('r1', 'a', 'b'),
          rel('r2', 'a', 'b'),
          rel('r3', 'a', 'a'),
          rel('r4', 'a', 'missing-node'),
        ]}
        positions={
          new Map([
            ['a', { x: 10, y: 20 }],
            ['b', { x: 30, y: 40 }],
          ])
        }
        selectedId={null}
        onSelect={() => {}}
      />,
    )

    const canvas = screen.getByRole('application')
    expect(canvas).toHaveAttribute(
      'aria-label',
      expect.stringContaining('3 entidades, 4 relaciones'),
    )

    const sigma = sigmaMocks.MockSigma.instances[0]!
    expect(sigma.graph.nodes).toEqual(
      new Map([
        [
          'a',
          expect.objectContaining({
            x: 10,
            y: -20,
            label: 'a',
            entityType: 'persona',
          }),
        ],
        [
          'b',
          expect.objectContaining({
            x: 30,
            y: -40,
            label: 'b',
            entityType: 'persona',
          }),
        ],
      ]),
    )
    expect([...sigma.graph.edges.keys()]).toEqual(['a->b'])
    expect(sigma.config.renderEdgeLabels).toBe(false)
    expect(sigma.config.renderLabels).toBe(true)
  })

  it('propaga clickNode/clickStage y refresca al cambiar selección sin reconstruir Sigma', () => {
    const onSelect = vi.fn()
    const { rerender, unmount } = render(
      <GraphCanvasSigma
        entities={[ent('a'), ent('b')]}
        relationships={[rel('r1', 'a', 'b')]}
        positions={
          new Map([
            ['a', { x: 10, y: 20 }],
            ['b', { x: 30, y: 40 }],
          ])
        }
        selectedId={null}
        onSelect={onSelect}
      />,
    )
    const sigma = sigmaMocks.MockSigma.instances[0]!

    sigma.handlers.get('clickNode')?.({ node: 'a' })
    sigma.handlers.get('clickStage')?.()
    expect(onSelect).toHaveBeenCalledWith('a')
    expect(onSelect).toHaveBeenCalledWith(null)

    rerender(
      <GraphCanvasSigma
        entities={[ent('a'), ent('b')]}
        relationships={[rel('r1', 'a', 'b')]}
        positions={
          new Map([
            ['a', { x: 10, y: 20 }],
            ['b', { x: 30, y: 40 }],
          ])
        }
        selectedId="a"
        onSelect={onSelect}
      />,
    )

    expect(sigmaMocks.MockSigma.instances).toHaveLength(1)
    expect(sigma.refresh).toHaveBeenCalled()

    const nodeReducer = sigma.config.nodeReducer as (
      node: string,
      data: Record<string, unknown>,
    ) => Record<string, unknown>
    expect(nodeReducer('a', { size: 6, color: '#aaa' })).toMatchObject({
      size: 9.600000000000001,
      color: '#1A1812',
      zIndex: 2,
    })

    const edgeReducer = sigma.config.edgeReducer as (
      edge: string,
      data: Record<string, unknown>,
    ) => Record<string, unknown>
    expect(edgeReducer('a->b', { size: 1, color: '#aaa' })).toMatchObject({
      size: 1.5,
      color: 'rgba(31, 77, 107, 0.55)',
      zIndex: 1,
    })

    unmount()
    expect(sigma.kill).toHaveBeenCalled()
  })

  it('desactiva labels cuando el grafo supera el umbral visual', () => {
    const entities = Array.from({ length: 500 }, (_, index) => ent(`e-${index}`))
    const positions = new Map(
      entities.map((entity, index) => [entity.id, { x: index, y: index }]),
    )

    render(
      <GraphCanvasSigma
        entities={entities}
        relationships={[]}
        positions={positions}
        selectedId={null}
        onSelect={() => {}}
      />,
    )

    expect(sigmaMocks.MockSigma.instances[0]!.config.renderLabels).toBe(false)
  })

  it('reconstruye Sigma cuando cambian posiciones con la misma cantidad de nodos', () => {
    const { rerender } = render(
      <GraphCanvasSigma
        entities={[ent('a'), ent('b')]}
        relationships={[rel('r1', 'a', 'b')]}
        positions={
          new Map([
            ['a', { x: 10, y: 20 }],
            ['b', { x: 30, y: 40 }],
          ])
        }
        selectedId={null}
        onSelect={() => {}}
      />,
    )
    const firstSigma = sigmaMocks.MockSigma.instances[0]!

    rerender(
      <GraphCanvasSigma
        entities={[ent('a'), ent('b')]}
        relationships={[rel('r1', 'a', 'b')]}
        positions={
          new Map([
            ['a', { x: 100, y: 200 }],
            ['b', { x: 300, y: 400 }],
          ])
        }
        selectedId={null}
        onSelect={() => {}}
      />,
    )

    expect(firstSigma.kill).toHaveBeenCalled()
    expect(sigmaMocks.MockSigma.instances).toHaveLength(2)
    expect(sigmaMocks.MockSigma.instances[1]!.graph.nodes.get('a')).toMatchObject({
      x: 100,
      y: -200,
    })
  })
})
