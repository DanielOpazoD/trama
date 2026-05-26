import type { LayoutEdge, LayoutNode, LayoutResult } from './types'

/**
 * Concentric layout by connection count. The most-connected nodes sit at the
 * center; less-connected nodes spiral outward. Reveals the hubs of the trama.
 */
export function byDegreeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  /** Rotation seed: each click on "reorganizar" rotates the rings so the
   *  user sees motion, even though the ordering by degree is unchanged. */
  seed = 0,
): LayoutResult {
  const degree = new Map<string, number>()
  for (const n of nodes) degree.set(n.id, 0)
  for (const e of edges) {
    if (e.fromId === e.toId) continue
    degree.set(e.fromId, (degree.get(e.fromId) ?? 0) + 1)
    degree.set(e.toId, (degree.get(e.toId) ?? 0) + 1)
  }

  // Sort: most-connected first. Stable on degree by falling back to id.
  const sorted = [...nodes].sort((a, b) => {
    const diff = (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)
    return diff !== 0 ? diff : a.id.localeCompare(b.id)
  })

  const out: LayoutResult = new Map()
  if (sorted.length === 0) return out

  // First node sits at the origin.
  out.set(sorted[0]!.id, { x: 0, y: 0 })
  if (sorted.length === 1) return out

  // Subsequent nodes go on concentric rings. Each ring holds more nodes than
  // the previous one to keep the visual spacing roughly constant.
  let ring = 1
  let placed = 1
  while (placed < sorted.length) {
    const ringRadius = 130 * ring
    const capacity = Math.max(6, Math.floor(2 * Math.PI * ring))
    const ringNodes = sorted.slice(placed, placed + capacity)
    // Rotate by a fraction of a slot per reseed. Alternates direction by ring
    // so adjacent rings don't move in lockstep.
    const direction = ring % 2 === 0 ? 1 : -1
    const rotationOffset =
      direction * (seed % ringNodes.length) * ((Math.PI * 2) / ringNodes.length) * 0.4
    ringNodes.forEach((node, i) => {
      const angle =
        (i / ringNodes.length) * Math.PI * 2 - Math.PI / 2 + rotationOffset
      out.set(node.id, {
        x: Math.cos(angle) * ringRadius,
        y: Math.sin(angle) * ringRadius,
      })
    })
    placed += ringNodes.length
    ring += 1
  }

  return out
}
