import { describe, expect, test } from 'vitest'
import type { NeighborsResponse } from '../../api'
import type { Entity, Relationship } from '../../types'
import {
  computeClusterCentroids,
  computeConnectionCount,
  computePositionBounds,
  selectGraphDataset,
} from './graphViewModel'

function entity(id: string, type = 'persona'): Entity {
  return {
    id,
    type,
    name: id,
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function relationship(id: string, fromId: string, toId: string): Relationship {
  return {
    id,
    fromId,
    toId,
    type: 'asociado_con',
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('graphViewModel', () => {
  test('selectGraphDataset usa el grafo completo fuera del modo exploratorio', () => {
    const entities = [entity('a')]
    const relationships = [relationship('r1', 'a', 'b')]

    expect(
      selectGraphDataset({
        graphMode: 'completo',
        allEntities: entities,
        allRelationships: relationships,
        neighbors: null,
      }),
    ).toEqual({ entities, relationships })
  })

  test('selectGraphDataset arma el subgrafo exploratorio sin duplicar el foco', () => {
    const from = { ...entity('focus'), hopDistance: 0 }
    const neighbor = { ...entity('other'), hopDistance: 1 }
    const rel = relationship('r1', 'focus', 'other')
    const neighbors: NeighborsResponse = {
      from,
      entities: [from, neighbor],
      relationships: [rel],
      hops: 2,
      limit: 120,
      truncated: false,
    }

    expect(
      selectGraphDataset({
        graphMode: 'exploratorio',
        allEntities: [entity('ignored')],
        allRelationships: [relationship('ignored-rel', 'x', 'y')],
        neighbors,
      }),
    ).toEqual({ entities: [from, neighbor], relationships: [rel] })
  })

  test('computePositionBounds devuelve null para mapas vacíos y bounds para posiciones', () => {
    expect(computePositionBounds(new Map())).toBeNull()

    expect(
      computePositionBounds(
        new Map([
          ['a', { x: -10, y: 20 }],
          ['b', { x: 30, y: -40 }],
        ]),
      ),
    ).toEqual({ minX: -10, minY: -40, maxX: 30, maxY: 20 })
  })

  test('computeConnectionCount cuenta aristas entrantes y salientes por entidad', () => {
    const counts = computeConnectionCount([
      relationship('r1', 'a', 'b'),
      relationship('r2', 'b', 'c'),
    ])

    expect(counts.get('a')).toBe(1)
    expect(counts.get('b')).toBe(2)
    expect(counts.get('c')).toBe(1)
  })

  test('computeClusterCentroids solo devuelve clusters by-type con dos o más nodos', () => {
    const entities = [entity('a', 'libro'), entity('b', 'libro'), entity('c', 'idea')]
    const positions = new Map([
      ['a', { x: 0, y: 10 }],
      ['b', { x: 20, y: 30 }],
      ['c', { x: 100, y: 100 }],
    ])

    expect(computeClusterCentroids('organic', entities, positions)).toBeNull()
    expect(computeClusterCentroids('by-type', entities, positions)).toEqual([
      { type: 'libro', label: 'libro', cx: 10, cy: 20, count: 2 },
    ])
  })
})
