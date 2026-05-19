import { useEffect, useRef } from 'react'

/**
 * Tracks which IDs from a list are "fresh" — present on this render but not
 * on previous ones. Returns a Set of fresh IDs for the current render.
 *
 * Used to animate node entry: components apply the animation class only when
 * the id is fresh, and CSS triggers the keyframe.
 */
export function useFreshIds(ids: string[]): Set<string> {
  const seen = useRef<Set<string>>(new Set())
  const fresh = useRef<Set<string>>(new Set())

  // Re-compute on every render before children mount.
  const current = new Set(ids)
  const newFresh = new Set<string>()
  for (const id of current) {
    if (!seen.current.has(id)) newFresh.add(id)
  }
  fresh.current = newFresh

  // After commit, mark all current ids as seen so they're not "fresh" next render.
  useEffect(() => {
    for (const id of current) seen.current.add(id)
    // Cleanup: drop seen ids that are no longer present (allow re-animation on re-add).
    for (const id of Array.from(seen.current)) {
      if (!current.has(id)) seen.current.delete(id)
    }
  })

  return fresh.current
}
