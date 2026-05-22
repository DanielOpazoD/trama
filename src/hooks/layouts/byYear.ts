import type { LayoutNode, LayoutResult } from './types'

/**
 * Timeline by year. X is mapped from year (min year on the left, max on the
 * right). Y stacks within the same year-bucket to avoid overlap. Entities
 * without a year go to a strip above the timeline.
 *
 * Reveals "how my interests have moved through time".
 */
export function byYearLayout(
  nodes: LayoutNode[],
  /** Each reseed shuffles which items sit above vs below the timeline so the
   *  click on "reorganizar" produces visible motion without breaking the
   *  chronological reading. */
  seed = 0,
): LayoutResult {
  const out: LayoutResult = new Map()
  if (nodes.length === 0) return out

  const withYear = nodes.filter(
    (n): n is LayoutNode & { year: number } => typeof n.year === 'number',
  )
  const withoutYear = nodes.filter((n) => typeof n.year !== 'number')

  const TIMELINE_WIDTH = 900
  const ROW_HEIGHT = 50
  const TIMELINE_Y_CENTER = 60
  const NO_YEAR_Y = -260

  if (withYear.length > 0) {
    const minYear = Math.min(...withYear.map((n) => n.year))
    const maxYear = Math.max(...withYear.map((n) => n.year))
    const span = Math.max(1, maxYear - minYear)

    // Bucket by year so multiple entries from the same year stack vertically.
    const buckets = new Map<number, LayoutNode[]>()
    for (const n of withYear) {
      const arr = buckets.get(n.year) ?? []
      arr.push(n)
      buckets.set(n.year, arr)
    }

    for (const [year, bucket] of buckets) {
      const xRatio = (year - minYear) / span
      const x = (xRatio - 0.5) * TIMELINE_WIDTH
      bucket.forEach((node, i) => {
        // Alternate above/below the timeline so stacks balance visually.
        // The seed flips the parity so reorganize visibly mirrors stacks.
        const sign = (i + seed) % 2 === 0 ? 1 : -1
        const offset = Math.ceil(i / 2) * ROW_HEIGHT * sign
        out.set(node.id, { x, y: TIMELINE_Y_CENTER + offset })
      })
    }
  }

  // Entities without a year go on a strip above the timeline, spread out.
  withoutYear.forEach((node, i) => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(withoutYear.length)))
    const row = Math.floor(i / cols)
    const col = i % cols
    out.set(node.id, {
      x: (col - (cols - 1) / 2) * 140,
      y: NO_YEAR_Y - row * ROW_HEIGHT,
    })
  })

  return out
}
