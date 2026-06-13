import { useCallback, useEffect, useRef, useState } from 'react'

export function useGraphHoverPreview({ delayMs = 600 }: { delayMs?: number } = {}) {
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null)
  const hoverTimerRef = useRef<number | null>(null)

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current === null) return
    window.clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = null
  }, [])

  const scheduleHover = useCallback(
    (id: string) => {
      clearHoverTimer()
      hoverTimerRef.current = window.setTimeout(() => {
        setHoveredEntityId(id)
        hoverTimerRef.current = null
      }, delayMs)
    },
    [clearHoverTimer, delayMs],
  )

  const cancelHover = useCallback(() => {
    clearHoverTimer()
    setHoveredEntityId(null)
  }, [clearHoverTimer])

  useEffect(() => clearHoverTimer, [clearHoverTimer])

  return { hoveredEntityId, scheduleHover, cancelHover }
}
