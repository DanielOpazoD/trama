import type { NeighborsResponse } from '../../api'
import type { LayoutMode } from '../../hooks/layouts/types'
import type { Entity, Relationship } from '../../types'
import { ENTITY_TYPES } from '../../types'
import type { GraphMode } from './GraphChrome'

type Position = { x: number; y: number }

export type PositionBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type ClusterCentroid = {
  type: string
  label: string
  cx: number
  cy: number
  count: number
}

export function selectGraphDataset({
  graphMode,
  allEntities,
  allRelationships,
  neighbors,
}: {
  graphMode: GraphMode
  allEntities: Entity[]
  allRelationships: Relationship[]
  neighbors: NeighborsResponse | null | undefined
}): { entities: Entity[]; relationships: Relationship[] } {
  if (graphMode !== 'exploratorio') {
    return { entities: allEntities, relationships: allRelationships }
  }
  if (!neighbors) return { entities: [], relationships: [] }

  const fromId = neighbors.from.id
  return {
    entities: [
      neighbors.from,
      ...neighbors.entities.filter((entity) => entity.id !== fromId),
    ],
    relationships: neighbors.relationships,
  }
}

export function computePositionBounds(
  positions: ReadonlyMap<string, Position>,
): PositionBounds | null {
  if (positions.size === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of positions.values()) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  if (!Number.isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

export function computeConnectionCount(
  relationships: readonly Relationship[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const rel of relationships) {
    map.set(rel.fromId, (map.get(rel.fromId) ?? 0) + 1)
    map.set(rel.toId, (map.get(rel.toId) ?? 0) + 1)
  }
  return map
}

export function computeClusterCentroids(
  mode: LayoutMode,
  entities: readonly Entity[],
  positions: ReadonlyMap<string, Position>,
): ClusterCentroid[] | null {
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

  const result: ClusterCentroid[] = []
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
}
