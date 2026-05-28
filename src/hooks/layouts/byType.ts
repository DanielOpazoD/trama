import type { LayoutEdge, LayoutNode, LayoutResult } from './types'
import { organicLayout } from './organic'

/**
 * Cluster by entity type: each type sits in its own ring around a central hub.
 * Within a cluster a small force layout untangles nodes that share edges; the
 * cluster center stays put.
 *
 * Reveals "what kinds of things populate the trama" at a glance.
 */
export function byTypeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  /** Optional rotation seed so "reorganizar" produces a visibly different
   *  arrangement on each click without changing the clustering itself. */
  seed = 0,
): LayoutResult {
  const byType = new Map<string, LayoutNode[]>()
  for (const n of nodes) {
    const arr = byType.get(n.type) ?? []
    arr.push(n)
    byType.set(n.type, arr)
  }

  const types = Array.from(byType.keys()).sort()
  const out: LayoutResult = new Map()

  // Place type centers on a circle, with the radius scaling with the number
  // of types so they don't collide when there are many.
  const typeCount = types.length
  const ringRadius = Math.max(280, 120 * typeCount)

  // Each reseed shifts the ring by a fraction of a slot — visible rotation.
  const rotationOffset = (seed % typeCount) * ((Math.PI * 2) / typeCount) * 0.5

  types.forEach((type, typeIdx) => {
    const angle = (typeIdx / typeCount) * Math.PI * 2 - Math.PI / 2 + rotationOffset
    const cx = Math.cos(angle) * ringRadius
    const cy = Math.sin(angle) * ringRadius

    const members = byType.get(type) ?? []
    if (members.length === 0) return

    // Single member: drop it on the center.
    if (members.length === 1) {
      out.set(members[0]!.id, { x: cx, y: cy })
      return
    }

    // Pre-seed members on a small circle around the center, then settle a
    // mini force layout restricted to intra-cluster edges so connected nodes
    // pull closer within the group.
    const seed = new Map<string, { x: number; y: number }>()
    const innerRadius = Math.min(80, 18 + members.length * 6)
    members.forEach((m, i) => {
      const a = (i / members.length) * Math.PI * 2
      seed.set(m.id, {
        x: cx + Math.cos(a) * innerRadius,
        y: cy + Math.sin(a) * innerRadius,
      })
    })

    const memberIds = new Set(members.map((m) => m.id))
    const intraEdges = edges.filter(
      (e) => memberIds.has(e.fromId) && memberIds.has(e.toId),
    )
    // Use a very short relaxation pass — we want to keep the cluster shape.
    const settled = organicLayout(members, intraEdges, {
      seed,
      iterations: 60,
    })

    // Re-center any drift so the cluster stays anchored at (cx, cy).
    let avgX = 0
    let avgY = 0
    for (const p of settled.values()) {
      avgX += p.x
      avgY += p.y
    }
    avgX /= settled.size
    avgY /= settled.size
    const offsetX = cx - avgX
    const offsetY = cy - avgY

    for (const [id, p] of settled) {
      out.set(id, { x: p.x + offsetX, y: p.y + offsetY })
    }
  })

  return out
}
